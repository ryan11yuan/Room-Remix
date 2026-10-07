import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readProbe, stepProgress } from '@/lib/splatJobs/progress';
import {
  isFinished,
  JOB_ERROR_MESSAGES,
  type JobErrorCode,
  type JobState,
  type JobView,
  type Quality,
  type RoomSummary,
} from '@/lib/splatJobs/protocol';
import { MIN_REGISTERED, pipelineSteps, SETTINGS, type PipelineStep } from '@/lib/splatJobs/settings';

export type RunningStep = { done: Promise<number>; kill(): void };
/** Runs one pipeline step for a job. `onLine` gets each line of its output; `done` resolves with the exit code. */
export type StepRunner = (jobId: string, dir: string, step: PipelineStep, onLine: (line: string) => void) => RunningStep;

type JobRecord = {
  id: string;
  quality: Quality;
  videoName: string;
  state: JobState;
  createdAt: number;
  error?: { code: JobErrorCode; message: string };
};
type Outcome = { state: 'ready' | 'failed' | 'canceled'; code?: JobErrorCode };

const RECORD = 'job.json';
const SPLAT = 'splat.spz';
const CAMERAS = 'cameras.json';

/** How many images COLMAP registered: the first 8 bytes (little-endian) of sparse/0/images.bin. 0 without a model. */
export async function registeredImages(dir: string): Promise<number> {
  try {
    const bytes = await readFile(path.join(dir, 'sparse', '0', 'images.bin'));
    return bytes.length >= 8 ? Number(bytes.readBigUInt64LE(0)) : 0;
  } catch {
    return 0;
  }
}

const tag = (id: string) => id.slice(0, 8);
const duration = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
};

const countFrames = async (dir: string) => (await readdir(path.join(dir, 'images'))).filter((n) => n.endsWith('.jpg')).length;
const exists = (file: string) => stat(file).then(
  () => true,
  () => false,
);

/**
 * The demo laptop's build queue (spec 2026-10-06 §4): one job at a time, each step run by `run`, state kept in each
 * job folder's job.json so a restarted server still answers for its jobs.
 */
export class JobQueue {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly progress = new Map<string, { done: number; total: number }>();
  private readonly waiting: string[] = [];
  private current: { id: string; step: RunningStep | null; canceled: boolean } | null = null;
  private building: Promise<void> = Promise.resolve();

  constructor(
    private readonly root: string,
    private readonly run: StepRunner,
    options: { log?: (line: string) => void; cleanup?: (jobId: string) => Promise<void> } = {},
  ) {
    this.log = options.log ?? console.log;
    this.cleanup = options.cleanup;
  }

  private readonly log: (line: string) => void;
  private readonly cleanup?: (jobId: string) => Promise<void>;

  /** True while a job is building. */
  get busy(): boolean {
    return this.current !== null;
  }

  /** Reads every job folder. Jobs that weren't finished when the server stopped become failed, `restarted`. */
  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      let job: JobRecord;
      try {
        job = JSON.parse(await readFile(path.join(this.root, entry.name, RECORD), 'utf8')) as JobRecord;
      } catch {
        continue; // no job.json: an upload that never finished
      }
      this.jobs.set(job.id, job);
      if (!isFinished(job.state)) await this.finish(job, 'failed', 'restarted');
    }
  }

  /** A new, empty job folder for an upload to be written into. */
  async reserve(): Promise<{ id: string; dir: string }> {
    const id = randomUUID();
    const dir = this.dirOf(id);
    for (const sub of ['images', 'sparse', 'logs']) await mkdir(path.join(dir, sub), { recursive: true });
    return { id, dir };
  }

  /** Throws away a reserved folder whose upload didn't finish. A real job's folder is never removed. */
  async discard(id: string): Promise<void> {
    if (this.jobs.has(id)) return;
    await rm(this.dirOf(id), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }

  /** Queues an uploaded video, and starts it if nothing is building. */
  async add(id: string, quality: Quality, videoName: string): Promise<JobView> {
    const job: JobRecord = { id, quality, videoName, state: 'queued', createdAt: Date.now() };
    this.jobs.set(id, job);
    await this.save(job);
    this.waiting.push(id);
    this.log(`job ${tag(id)} queued (${quality})`);
    const view = this.get(id)!;
    this.pump();
    return view;
  }

  get(id: string): JobView | null {
    const job = this.jobs.get(id);
    if (!job) return null;
    const view: JobView = { id, quality: job.quality, state: job.state };
    if (job.state === 'queued') view.place = this.waiting.indexOf(id) + (this.current ? 1 : 0);
    const progress = this.progress.get(id);
    if (progress && !isFinished(job.state)) view.progress = { ...progress };
    if (job.error) view.error = job.error;
    return view;
  }

  /** A queued job is dropped; a running one has its step killed and ends `canceled`. The folder stays. */
  async cancel(id: string): Promise<JobView | null> {
    const job = this.jobs.get(id);
    if (!job) return null;
    const at = this.waiting.indexOf(id);
    if (at >= 0) {
      this.waiting.splice(at, 1);
      await this.finish(job, 'canceled');
      this.log(`job ${tag(id)} canceled`);
    } else if (this.current?.id === id) {
      this.current.canceled = true;
      this.current.step?.kill();
    }
    return this.get(id);
  }

  splatPath(id: string): string | null {
    return this.jobs.get(id)?.state === 'ready' ? path.join(this.dirOf(id), SPLAT) : null;
  }

  /** Finished rooms, newest first (spec 2026-10-07 §5). */
  rooms(): RoomSummary[] {
    return [...this.jobs.values()]
      .filter((job) => job.state === 'ready')
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ id, quality, createdAt }) => ({ id, quality, createdAt }));
  }

  /** Where a ready job's cameras file would be; null for unknown or unfinished jobs. Older builds have no such file. */
  camerasPath(id: string): string | null {
    return this.jobs.get(id)?.state === 'ready' ? path.join(this.dirOf(id), CAMERAS) : null;
  }

  /** Resolves once nothing is building or waiting. */
  async settled(): Promise<void> {
    while (this.current) await this.building;
  }

  private dirOf(id: string): string {
    return path.join(this.root, id);
  }

  private async save(job: JobRecord): Promise<void> {
    await writeFile(path.join(this.dirOf(job.id), RECORD), JSON.stringify(job, null, 2));
  }

  private async finish(job: JobRecord, state: Outcome['state'], code?: JobErrorCode): Promise<void> {
    job.state = state;
    if (code) job.error = { code, message: JOB_ERROR_MESSAGES[code] };
    this.progress.delete(job.id);
    // A record that can't be written is still reported from memory until the server stops.
    await this.save(job).catch((error) => console.error(`Couldn't save job ${job.id}:`, error));
  }

  private pump(): void {
    if (this.current) return;
    const id = this.waiting.shift();
    if (!id) return;
    this.current = { id, step: null, canceled: false };
    this.building = this.build(this.jobs.get(id)!).finally(() => {
      this.current = null;
      this.pump();
    });
  }

  private async build(job: JobRecord): Promise<void> {
    let outcome: Outcome;
    const started = Date.now();
    try {
      outcome = await this.runSteps(job);
    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      outcome = { state: 'failed', code: 'step-failed' };
    }
    await this.finish(job, outcome.state, outcome.code);
    this.log(
      outcome.state === 'ready'
        ? `job ${tag(job.id)} ready in ${duration(Date.now() - started)}`
        : outcome.state === 'failed'
          ? `job ${tag(job.id)} failed ${outcome.code}`
          : `job ${tag(job.id)} canceled`,
    );
    // Last, so the next job always starts: a failed cleanup is logged, never thrown.
    try {
      await this.cleanup?.(job.id);
    } catch (error) {
      console.error(`Cleanup for job ${job.id} failed:`, error);
    }
  }

  private async runSteps(job: JobRecord): Promise<Outcome> {
    const dir = this.dirOf(job.id);
    const current = this.current!;
    const totalSteps = SETTINGS[job.quality].steps;
    let frames = 0;
    for (const step of pipelineSteps(job.quality, job.videoName)) {
      if (job.state !== step.state) {
        job.state = step.state;
        this.log(`job ${tag(job.id)} ${step.state}`);
        this.progress.delete(job.id);
        await this.save(job);
      }
      // After the save: a cancel that arrived during it found no step to kill, so it must stop the job here.
      if (current.canceled) return { state: 'canceled' };
      const output: string[] = [];
      const running = this.run(job.id, dir, step, (line) => {
        if (step.name === 'probe') output.push(line);
        const progress = stepProgress(step.name, line, frames, totalSteps);
        if (progress) this.progress.set(job.id, progress);
      });
      current.step = running;
      const code = await running.done.catch(() => -1);
      current.step = null;
      if (current.canceled) return { state: 'canceled' };
      // -1 is the docker CLI failing to start; 125-127 come from `docker run` itself (daemon, image or GPU). Not the video's fault.
      // 137 (killed, out of memory) stays out of this: OpenSplat at 137 still says "Try Quick".
      if (code === -1 || (code >= 125 && code <= 127)) {
        console.error(`Job ${job.id}: docker couldn't run ${step.name} (exit ${code}); see logs/${step.name}.log`);
        return { state: 'failed', code: 'step-failed' };
      }
      switch (step.name) {
        case 'probe': {
          const probe = code === 0 ? readProbe(output.join('\n')) : ({ ok: false, code: 'not-video' } as const);
          if (!probe.ok) return { state: 'failed', code: probe.code };
          break;
        }
        case 'frames':
          frames = code === 0 ? await countFrames(dir) : 0;
          if (frames === 0) return { state: 'failed', code: 'not-video' };
          break;
        case 'mapper':
          if (code !== 0 || (await registeredImages(dir)) < MIN_REGISTERED) return { state: 'failed', code: 'no-model' };
          break;
        case 'training':
          if (code !== 0 || !(await exists(path.join(dir, SPLAT)))) return { state: 'failed', code: 'training-failed' };
          break;
        default:
          if (code !== 0) return { state: 'failed', code: 'step-failed' };
      }
    }
    return { state: 'ready' };
  }
}
