import type { RoomState } from '@/lib/room/types';
import type { SimRequest, SimResponse } from './protocol';
import type { AcousticsResult } from './simulate';

export type SimOutput = { now: AcousticsResult; withFixes: AcousticsResult };

export type WorkerLike = {
  onmessage: ((event: MessageEvent<SimResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: SimRequest): void;
  terminate(): void;
};
export type WorkerFactory = () => WorkerLike;

export const SUPERSEDED = 'Superseded by a newer request';
export const CRASHED = 'The simulation stopped unexpectedly.';
export const CANCELLED = 'Simulation cancelled';

const createModuleWorker: WorkerFactory = () =>
  new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

type Job = { room: RoomState; sampleRate: number; resolve: (value: SimOutput) => void; reject: (error: Error) => void };

/**
 * Runs room simulations in a Web Worker, one at a time. While one runs, only the newest waiting request is kept,
 * so a burst of edits never queues stale work. A crashed worker is replaced on the next request.
 */
export class AcousticsClient {
  private worker: WorkerLike | null = null;
  private running: (Job & { id: number }) | null = null;
  private waiting: Job | null = null;
  private nextId = 1;
  private disposed = false;

  constructor(private readonly createWorker: WorkerFactory = createModuleWorker) {}

  simulate(room: RoomState, sampleRate: number): Promise<SimOutput> {
    if (this.disposed) return Promise.reject(new Error(CANCELLED));
    return new Promise((resolve, reject) => {
      this.waiting?.reject(new Error(SUPERSEDED));
      this.waiting = { room, sampleRate, resolve, reject };
      this.startNext();
    });
  }

  dispose(): void {
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    this.running?.reject(new Error(CANCELLED));
    this.waiting?.reject(new Error(CANCELLED));
    this.running = null;
    this.waiting = null;
  }

  private startNext(): void {
    if (this.running || !this.waiting) return;
    const job = { ...this.waiting, id: this.nextId++ };
    this.waiting = null;
    this.running = job;
    try {
      this.ensureWorker().postMessage({ id: job.id, room: job.room, sampleRate: job.sampleRate });
    } catch (error) {
      this.running = null;
      this.worker?.terminate();
      this.worker = null;
      job.reject(new Error(error instanceof Error && error.message ? error.message : CRASHED));
      this.startNext();
    }
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.onmessage = (event) => {
      if (this.worker !== worker) return;
      const res = event.data;
      const job = this.running;
      if (!job || job.id !== res.id) return;
      this.running = null;
      if (res.ok) job.resolve({ now: res.now, withFixes: res.withFixes });
      else job.reject(new Error(res.error));
      this.startNext();
    };
    worker.onerror = (event) => {
      if (this.worker !== worker) return;
      event.preventDefault?.();
      const job = this.running;
      this.running = null;
      worker.terminate();
      this.worker = null; // a fresh one is created for the next job
      job?.reject(new Error(event.message || CRASHED));
      this.startNext();
    };
    this.worker = worker;
    return worker;
  }
}
