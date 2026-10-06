import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JOB_ERROR_MESSAGES } from '@/lib/splatJobs/protocol';
import { SETTINGS, type StepName } from '@/lib/splatJobs/settings';
import { JobQueue, registeredImages, type StepRunner } from './jobs';

type Behaviour = { lines?: string[]; code?: number; effect?: (dir: string) => Promise<unknown>; hold?: Promise<void>; throws?: boolean };

const PROBE_OK = JSON.stringify({ format: { duration: '45.0' }, streams: [{ codec_type: 'video' }] });

async function writeImagesBin(dir: string, count: number) {
  await mkdir(path.join(dir, 'sparse', '0'), { recursive: true });
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(count));
  await writeFile(path.join(dir, 'sparse', '0', 'images.bin'), bytes);
}

async function writeFrames(dir: string, count: number) {
  for (let i = 1; i <= count; i++) await writeFile(path.join(dir, 'images', `${String(i).padStart(4, '0')}.jpg`), '');
}

/** A runner that acts out each step: by default every step succeeds and leaves what the next one needs. */
function fakeRunner(overrides: Partial<Record<StepName, Behaviour>> = {}) {
  const log: string[] = [];
  const killed: string[] = [];
  const defaults: Record<StepName, Behaviour> = {
    probe: { lines: [PROBE_OK] },
    frames: { effect: (dir) => writeFrames(dir, 20) },
    features: {},
    matching: {},
    mapper: { lines: ['Registering image #4 (1)', 'Registering image #9 (2)'], effect: (dir) => writeImagesBin(dir, 20) },
    training: { lines: ['Using CUDA', 'Step 10: 0.21 [0%]'], effect: (dir) => writeFile(path.join(dir, 'splat.spz'), 'spz') },
  };
  const run: StepRunner = (id, dir, step, onLine) => {
    log.push(`${id}:${step.name}`);
    const b = { ...defaults[step.name], ...overrides[step.name] };
    let kill!: () => void;
    const killedAt = new Promise<number>((resolve) => {
      kill = () => {
        killed.push(`${id}:${step.name}`);
        resolve(137);
      };
    });
    const done = (async () => {
      for (const line of b.lines ?? []) onLine(line);
      if (b.hold) {
        const code = await Promise.race([b.hold.then(() => null), killedAt]);
        if (code !== null) return code;
      }
      if (b.throws) throw new Error('docker vanished');
      await b.effect?.(dir);
      return b.code ?? 0;
    })();
    return { done, kill };
  };
  return { run, log, killed };
}

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'rr-jobs-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
});

async function queued(queue: JobQueue, quality: 'quick' | 'best' = 'quick') {
  const { id } = await queue.reserve();
  return queue.add(id, quality, 'video.mp4');
}

describe('JobQueue', () => {
  it('builds a video through every step to a ready splat, and keeps the record in job.json', async () => {
    const runner = fakeRunner();
    const queue = new JobQueue(root, runner.run);
    await queue.init();
    const job = await queued(queue);
    expect(job).toEqual({ id: job.id, quality: 'quick', state: 'queued', place: 0 });
    await queue.settled();
    expect(queue.get(job.id)).toEqual({ id: job.id, quality: 'quick', state: 'ready' });
    expect(runner.log).toEqual(['probe', 'frames', 'features', 'matching', 'mapper', 'training'].map((s) => `${job.id}:${s}`));
    const splat = queue.splatPath(job.id)!;
    expect((await stat(splat)).isFile()).toBe(true);
    expect(JSON.parse(await readFile(path.join(root, job.id, 'job.json'), 'utf8'))).toMatchObject({ state: 'ready', videoName: 'video.mp4' });
  });

  it('reports the running step state and its progress', async () => {
    const training = gate();
    const queue = new JobQueue(root, fakeRunner({ training: { hold: training.opened } }).run);
    await queue.init();
    const job = await queued(queue);
    // Progress appears once OpenSplat is running (the state changes a moment earlier, before job.json is saved).
    await vi.waitFor(() => expect(queue.get(job.id)?.progress).toEqual({ done: 10, total: SETTINGS.quick.steps }));
    expect(queue.get(job.id)?.state).toBe('training');
    training.open();
    await queue.settled();
    expect(queue.get(job.id)?.progress).toBeUndefined();
  });

  it('fails a video that is too long without pulling frames', async () => {
    const tooLong = JSON.stringify({ format: { duration: '200' }, streams: [{ codec_type: 'video' }] });
    const runner = fakeRunner({ probe: { lines: [tooLong] } });
    const queue = new JobQueue(root, runner.run);
    await queue.init();
    const job = await queued(queue);
    await queue.settled();
    expect(queue.get(job.id)).toMatchObject({ state: 'failed', error: { code: 'too-long', message: JOB_ERROR_MESSAGES['too-long'] } });
    expect(runner.log).toEqual([`${job.id}:probe`]);
  });

  it('fails as not-video when ffprobe or ffmpeg fail, or no frames come out', async () => {
    for (const overrides of [{ probe: { code: 1 } }, { frames: { code: 1 } }, { frames: { effect: async () => {} } }]) {
      const queue = new JobQueue(root, fakeRunner(overrides).run);
      await queue.init();
      const job = await queued(queue);
      await queue.settled();
      expect(queue.get(job.id)?.error?.code).toBe('not-video');
    }
  });

  it('fails with no-model when COLMAP registers fewer than 10 frames, and skips training', async () => {
    const runner = fakeRunner({ mapper: { effect: (dir) => writeImagesBin(dir, 3) } });
    const queue = new JobQueue(root, runner.run);
    await queue.init();
    const job = await queued(queue);
    await queue.settled();
    expect(queue.get(job.id)?.error?.code).toBe('no-model');
    expect(runner.log.some((entry) => entry.endsWith(':training'))).toBe(false);
  });

  it('fails with training-failed when OpenSplat exits non-zero or writes no splat', async () => {
    for (const overrides of [{ training: { code: 1 } }, { training: { effect: async () => {} } }]) {
      const queue = new JobQueue(root, fakeRunner(overrides).run);
      await queue.init();
      const job = await queued(queue);
      await queue.settled();
      expect(queue.get(job.id)).toMatchObject({ state: 'failed', error: { code: 'training-failed' } });
      expect(queue.splatPath(job.id)).toBeNull();
    }
  });

  it('fails as step-failed when a step cannot even run', async () => {
    const queue = new JobQueue(root, fakeRunner({ features: { throws: true } }).run);
    await queue.init();
    const job = await queued(queue);
    await queue.settled();
    expect(queue.get(job.id)?.error?.code).toBe('step-failed');
  });

  it('builds one job at a time and tells queued jobs their place in line', async () => {
    const training = gate();
    const runner = fakeRunner({ training: { hold: training.opened } });
    const queue = new JobQueue(root, runner.run);
    await queue.init();
    const first = await queued(queue);
    await vi.waitFor(() => expect(queue.get(first.id)?.state).toBe('training'));
    const second = await queued(queue, 'best');
    const third = await queued(queue);
    expect(queue.get(second.id)).toMatchObject({ state: 'queued', place: 1 });
    expect(queue.get(third.id)).toMatchObject({ state: 'queued', place: 2 });
    training.open();
    await queue.settled();
    expect([first, second, third].map((j) => queue.get(j.id)?.state)).toEqual(['ready', 'ready', 'ready']);
    const firstOfSecond = runner.log.indexOf(`${second.id}:probe`);
    expect(runner.log.slice(0, firstOfSecond).every((entry) => entry.startsWith(first.id))).toBe(true);
  });

  it('cancels a queued job without running it', async () => {
    const training = gate();
    const runner = fakeRunner({ training: { hold: training.opened } });
    const queue = new JobQueue(root, runner.run);
    await queue.init();
    const first = await queued(queue);
    const second = await queued(queue);
    expect((await queue.cancel(second.id))?.state).toBe('canceled');
    training.open();
    await queue.settled();
    expect(queue.get(first.id)?.state).toBe('ready');
    expect(runner.log.some((entry) => entry.startsWith(second.id))).toBe(false);
  });

  it('cancels a running job by killing its step, ends it canceled (not failed) and starts the next', async () => {
    const training = gate();
    const runner = fakeRunner({ training: { hold: training.opened } });
    const queue = new JobQueue(root, runner.run);
    await queue.init();
    const first = await queued(queue);
    const second = await queued(queue);
    await vi.waitFor(() => expect(queue.get(first.id)?.progress).toBeDefined()); // OpenSplat is running
    await queue.cancel(first.id);
    expect(runner.killed).toEqual([`${first.id}:training`]);
    training.open();
    await queue.settled();
    expect(queue.get(first.id)).toEqual({ id: first.id, quality: 'quick', state: 'canceled' });
    expect(queue.get(second.id)?.state).toBe('ready');
  });

  it('after a restart, fails unfinished jobs as restarted, keeps finished ones and skips unfinished uploads', async () => {
    const write = async (id: string, state: string) => {
      await mkdir(path.join(root, id), { recursive: true });
      await writeFile(path.join(root, id, 'job.json'), JSON.stringify({ id, quality: 'quick', videoName: 'video.mp4', state, createdAt: 1 }));
    };
    await write('building', 'training');
    await write('waiting', 'queued');
    await write('done', 'ready');
    await mkdir(path.join(root, 'upload-cut-off'));
    const queue = new JobQueue(root, fakeRunner().run);
    await queue.init();
    expect(queue.get('building')).toMatchObject({ state: 'failed', error: { code: 'restarted', message: JOB_ERROR_MESSAGES.restarted } });
    expect(queue.get('waiting')?.state).toBe('failed');
    expect(queue.get('done')?.state).toBe('ready');
    expect(queue.get('upload-cut-off')).toBeNull();
    expect(JSON.parse(await readFile(path.join(root, 'building', 'job.json'), 'utf8')).state).toBe('failed');
  });

  it('creates its folder, answers null for unknown ids and discards only folders that never became jobs', async () => {
    const queue = new JobQueue(path.join(root, 'nested', 'jobs'), fakeRunner().run);
    await queue.init();
    expect(queue.get('nope')).toBeNull();
    expect(await queue.cancel('nope')).toBeNull();
    expect(queue.splatPath('nope')).toBeNull();
    const { id, dir } = await queue.reserve();
    for (const sub of ['images', 'sparse', 'logs']) expect((await stat(path.join(dir, sub))).isDirectory()).toBe(true);
    await queue.discard(id);
    await expect(stat(dir)).rejects.toThrow();
    const job = await queued(queue);
    await queue.settled();
    await queue.discard(job.id);
    expect(queue.get(job.id)?.state).toBe('ready');
  });
});

describe('registeredImages', () => {
  it('reads the image count from images.bin, or 0 without a model', async () => {
    expect(await registeredImages(root)).toBe(0);
    await writeImagesBin(root, 37);
    expect(await registeredImages(root)).toBe(37);
  });
});
