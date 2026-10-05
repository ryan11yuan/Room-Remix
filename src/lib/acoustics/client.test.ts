import { describe, expect, it } from 'vitest';
import { defaultRoom } from '@/lib/room/roomState';
import { AcousticsClient, CRASHED, SUPERSEDED, type WorkerLike } from './client';
import type { SimRequest, SimResponse } from './protocol';
import type { AcousticsResult } from './simulate';

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<SimResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: SimRequest[] = [];
  terminated = false;
  postMessage(message: SimRequest) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  /** Answer the most recent request. */
  reply(ok = true) {
    const { id } = this.posted[this.posted.length - 1];
    const result = { rt60: { mid: id } } as unknown as AcousticsResult;
    const data: SimResponse = ok ? { id, ok: true, now: result, withFixes: result } : { id, ok: false, error: 'bad room' };
    this.onmessage?.({ data } as MessageEvent<SimResponse>);
  }
  crash(message = '') {
    this.onerror?.({ message, preventDefault() {} } as unknown as ErrorEvent);
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const client = new AcousticsClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { client, workers };
}

const room = defaultRoom();

describe('AcousticsClient', () => {
  it('creates its worker lazily and resolves with both results', async () => {
    const { client, workers } = setup();
    expect(workers).toHaveLength(0);
    const result = client.simulate(room, 48000);
    expect(workers).toHaveLength(1);
    workers[0].reply();
    await expect(result).resolves.toMatchObject({ now: { rt60: { mid: 1 } } });
  });

  it('runs one job at a time and keeps only the newest waiting request', async () => {
    const { client, workers } = setup();
    const first = client.simulate(room, 48000);
    const second = client.simulate(room, 48000);
    const third = client.simulate(room, 48000);
    await expect(second).rejects.toThrow(SUPERSEDED);
    expect(workers[0].posted).toHaveLength(1);
    workers[0].reply();
    await expect(first).resolves.toBeDefined();
    expect(workers[0].posted).toHaveLength(2); // the waiting request starts as soon as the first finishes
    workers[0].reply();
    await expect(third).resolves.toBeDefined();
  });

  it('rejects a failed simulation with its message', async () => {
    const { client, workers } = setup();
    const result = client.simulate(room, 48000);
    workers[0].reply(false);
    await expect(result).rejects.toThrow('bad room');
  });

  it('replaces a crashed worker on the next request', async () => {
    const { client, workers } = setup();
    const result = client.simulate(room, 48000);
    workers[0].crash();
    await expect(result).rejects.toThrow(CRASHED);
    expect(workers[0].terminated).toBe(true);
    const next = client.simulate(room, 48000);
    expect(workers).toHaveLength(2);
    workers[1].reply();
    await expect(next).resolves.toBeDefined();
  });

  it('starts a waiting request on a fresh worker after a crash', async () => {
    const { client, workers } = setup();
    const running = client.simulate(room, 48000);
    const waiting = client.simulate(room, 48000);
    workers[0].crash('boom');
    await expect(running).rejects.toThrow('boom');
    expect(workers).toHaveLength(2);
    expect(workers[1].posted).toHaveLength(1);
    workers[1].reply();
    await expect(waiting).resolves.toBeDefined();
  });

  it('ignores a late error from a worker it already replaced', async () => {
    const { client, workers } = setup();
    const first = client.simulate(room, 48000);
    workers[0].crash('first');
    await expect(first).rejects.toThrow('first');
    const second = client.simulate(room, 48000);
    workers[0].crash('stale'); // the old worker reports again
    workers[1].reply();
    await expect(second).resolves.toBeDefined();
  });

  it('recovers when creating the worker throws', async () => {
    let fail = true;
    const workers: FakeWorker[] = [];
    const client = new AcousticsClient(() => {
      if (fail) throw new Error('no workers here');
      const w = new FakeWorker();
      workers.push(w);
      return w;
    });
    await expect(client.simulate(room, 48000)).rejects.toThrow('no workers here');
    fail = false;
    const next = client.simulate(room, 48000);
    workers[0].reply();
    await expect(next).resolves.toBeDefined();
  });

  it('rejects everything on dispose and refuses later requests', async () => {
    const { client, workers } = setup();
    const running = client.simulate(room, 48000);
    const waiting = client.simulate(room, 48000);
    client.dispose();
    await expect(running).rejects.toThrow('cancelled');
    await expect(waiting).rejects.toThrow('cancelled');
    expect(workers[0].terminated).toBe(true);
    await expect(client.simulate(room, 48000)).rejects.toThrow('cancelled');
  });
});
