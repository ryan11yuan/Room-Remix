import type { StereoIr } from '@/lib/acoustics/simulate';
import type { RoomState } from '@/lib/room/types';
import type { SoundRequest, SoundResponse } from './protocol';
import type { SpotMap } from './types';

export type WorkerLike = {
  onmessage: ((event: MessageEvent<SoundResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: SoundRequest): void;
  terminate(): void;
};
export const SUPERSEDED = 'Superseded by a newer request';
const CANCELLED = 'Sound cancelled';
const CRASHED = 'The sound worker stopped unexpectedly.';

const createModuleWorker = (): WorkerLike =>
  new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type Job = { request: SoundRequest; resolve: (res: SoundResponse) => void; reject: (error: Error) => void };

/** One worker, one job at a time; only the newest waiting job is kept (like acoustics/client). */
class Lane {
  private worker: WorkerLike | null = null;
  private running: Job | null = null;
  private waiting: Job | null = null;
  private nextId = 1;
  private disposed = false;

  constructor(private readonly create: () => WorkerLike) {}

  run(request: DistributiveOmit<SoundRequest, 'id'>): Promise<SoundResponse> {
    if (this.disposed) return Promise.reject(new Error(CANCELLED));
    return new Promise((resolve, reject) => {
      this.waiting?.reject(new Error(SUPERSEDED));
      this.waiting = { request: { ...request, id: this.nextId++ } as SoundRequest, resolve, reject };
      this.startNext();
    });
  }

  dispose(): void {
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    this.running?.reject(new Error(CANCELLED));
    this.waiting?.reject(new Error(CANCELLED));
    this.running = this.waiting = null;
  }

  private startNext(): void {
    if (this.running || !this.waiting) return;
    this.running = this.waiting;
    this.waiting = null;
    this.ensureWorker().postMessage(this.running.request);
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker;
    const worker = this.create();
    worker.onmessage = (event) => {
      const job = this.running;
      if (this.worker !== worker || !job || job.request.id !== event.data.id) return;
      this.running = null;
      job.resolve(event.data);
      this.startNext();
    };
    worker.onerror = (event) => {
      if (this.worker !== worker) return;
      event.preventDefault?.();
      worker.terminate();
      this.worker = null;
      const job = this.running;
      this.running = null;
      job?.reject(new Error(event.message || CRASHED));
      this.startNext();
    };
    this.worker = worker;
    return worker;
  }
}

/** Walking IRs and the best-spot map, each in its own worker so a map search never delays the sound (spec §6–7). */
export class SoundClient {
  private readonly irLane: Lane;
  private readonly spotLane: Lane;

  constructor(createWorker: () => WorkerLike = createModuleWorker) {
    this.irLane = new Lane(createWorker);
    this.spotLane = new Lane(createWorker);
  }

  async ir(room: RoomState, sampleRate: number): Promise<{ ir: StereoIr; rt60: number }> {
    const res = await this.irLane.run({ kind: 'ir', room, sampleRate });
    if (!res.ok) throw new Error(res.error);
    if (res.kind !== 'ir') throw new Error('Unexpected response');
    return { ir: res.ir, rt60: res.rt60 };
  }

  async spots(room: RoomState): Promise<SpotMap> {
    const res = await this.spotLane.run({ kind: 'spots', room });
    if (!res.ok) throw new Error(res.error);
    if (res.kind !== 'spots') throw new Error('Unexpected response');
    return res.map;
  }

  dispose(): void {
    this.irLane.dispose();
    this.spotLane.dispose();
  }
}
