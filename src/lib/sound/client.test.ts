import { describe, expect, it } from 'vitest';
import type { SoundRequest, SoundResponse } from './protocol';
import { SoundClient, SUPERSEDED, type WorkerLike } from './client';
import { soundRoom } from './soundRoom';

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<SoundResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  sent: SoundRequest[] = [];
  postMessage(message: SoundRequest) {
    this.sent.push(message);
  }
  terminate() {}
  answer(response: SoundResponse) {
    this.onmessage?.({ data: response } as MessageEvent<SoundResponse>);
  }
}
const room = soundRoom({ length: 5, width: 4, height: 2.7 }, [], { x: 1, y: 1, z: 2 }, { x: 4, y: 1.2, z: 2, yaw: 0 });

describe('SoundClient', () => {
  it('runs one IR at a time and keeps only the newest waiting one', async () => {
    const workers: FakeWorker[] = [];
    const client = new SoundClient(() => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    });
    const first = client.ir(room, 16000);
    const second = client.ir(room, 16000);
    const third = client.ir(room, 16000);
    await expect(second).rejects.toThrow(SUPERSEDED);
    const ir = { left: new Float32Array(1), right: new Float32Array(1), sampleRate: 16000 };
    const w = workers[0];
    w.answer({ id: w.sent[0].id, ok: true, kind: 'ir', ir, rt60: 0.4 });
    await expect(first).resolves.toEqual({ ir, rt60: 0.4 });
    expect(w.sent).toHaveLength(2);
    w.answer({ id: w.sent[1].id, ok: true, kind: 'ir', ir, rt60: 0.5 });
    await expect(third).resolves.toMatchObject({ rt60: 0.5 });
  });
});
