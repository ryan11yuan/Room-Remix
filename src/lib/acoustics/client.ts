import type { RoomState } from '@/lib/room/types';
import type { SimResponse } from './protocol';
import type { AcousticsResult } from './simulate';

export type SimOutput = { now: AcousticsResult; withFixes: AcousticsResult };

type Pending = { resolve: (value: SimOutput) => void; reject: (error: Error) => void };

/** Runs room simulations in a Web Worker so dragging and typing stay smooth. */
export class AcousticsClient {
  private readonly worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    this.worker.onmessage = (event: MessageEvent<SimResponse>) => {
      const res = event.data;
      const pending = this.pending.get(res.id);
      if (!pending) return;
      this.pending.delete(res.id);
      if (res.ok) pending.resolve({ now: res.now, withFixes: res.withFixes });
      else pending.reject(new Error(res.error));
    };
    this.worker.onerror = (event) => {
      for (const p of this.pending.values()) p.reject(new Error(event.message || "Couldn't simulate this room"));
      this.pending.clear();
    };
  }

  simulate(room: RoomState, sampleRate: number): Promise<SimOutput> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, room, sampleRate });
    });
  }

  dispose(): void {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new Error('Simulation cancelled'));
    this.pending.clear();
  }
}
