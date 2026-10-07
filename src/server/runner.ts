import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { PipelineHealth } from '@/lib/splatJobs/protocol';
import type { PipelineStep } from '@/lib/splatJobs/settings';
import type { StepRunner } from './jobs';

/** Built by `npm run pipeline:build` from pipeline/Dockerfile. */
export const IMAGE = 'room-remix-splat';

/** The per-job Docker volume that holds COLMAP's database (mounted at /db). Docker creates it on first use. */
export const jobVolume = (jobId: string) => `rr-${jobId}-db`;

const containerName = (jobId: string, step: PipelineStep) => `rr-${jobId}-${step.name}`;

/** `docker` arguments that run one step with its job folder mounted at /job (and the COLMAP steps' database volume at /db). Only OpenSplat gets the GPU. */
export function dockerArgs(jobId: string, dir: string, step: PipelineStep): string[] {
  return [
    'run', '--rm',
    ...(step.gpu ? ['--gpus', 'all'] : []),
    '--name', containerName(jobId, step),
    '-v', `${dir}:/job`,
    ...(step.db ? ['-v', `${jobVolume(jobId)}:/db`] : []),
    IMAGE,
    ...step.args,
  ];
}

/** Splits streamed text into lines on \n, \r\n or \r (ffmpeg and COLMAP redraw progress with \r). Empty lines are skipped. */
export function lineSplitter(onLine: (line: string) => void): { push(chunk: string): void; end(): void } {
  let rest = '';
  return {
    push(chunk) {
      const parts = (rest + chunk).split(/\r\n|\r|\n/);
      rest = parts.pop() ?? '';
      for (const part of parts) if (part) onLine(part);
    },
    end() {
      if (rest) onLine(rest);
      rest = '';
    },
  };
}

const KILL_EVERY_MS = 3000;
const KILL_RETRIES = 10;

type Spawn = (command: string, args: string[]) => ChildProcess;
const spawnHidden: Spawn = (command, args) => spawn(command, args, { windowsHide: true });

/** Runs each step as its own `docker run`, writing everything it prints to logs/<step>.log in the job folder. */
export function dockerRunner(spawnFn: Spawn = spawnHidden): StepRunner {
  return (jobId, dir, step, onLine) => {
    mkdirSync(path.join(dir, 'logs'), { recursive: true });
    const log = createWriteStream(path.join(dir, 'logs', `${step.name}.log`));
    log.on('error', (error) => console.error(`Couldn't write ${step.name}.log:`, error));
    const child = spawnFn('docker', dockerArgs(jobId, dir, step));
    const out = lineSplitter(onLine);
    const err = lineSplitter(onLine);
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
      log.write(chunk);
      out.push(chunk);
    });
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
      log.write(chunk);
      err.push(chunk);
    });
    const done = new Promise<number>((resolve) => {
      let ended = false;
      const end = (code: number, note?: string) => {
        if (ended) return;
        ended = true;
        out.end();
        err.end();
        if (note) log.end(note, () => resolve(code));
        else log.end(() => resolve(code));
      };
      child.on('error', (error) => end(-1, `\n${String(error)}\n`));
      child.on('close', (code: number | null) => end(code ?? -1));
    });
    let settled = false;
    void done.then(() => {
      settled = true;
    });
    return {
      done,
      // Killing the docker CLI alone can leave the container running, and a kill sent before the container exists
      // finds nothing: kill the container by name now, then again every 3 s until the step ends (30 s at most).
      kill: () => {
        const kill = () => spawnFn('docker', ['kill', containerName(jobId, step)]).on('error', () => {});
        kill();
        let tries = 0;
        const timer = setInterval(() => {
          if (settled || ++tries > KILL_RETRIES) return clearInterval(timer);
          kill();
        }, KILL_EVERY_MS);
        void done.then(() => clearInterval(timer));
      },
    };
  };
}

type Exec = (command: string, args: string[]) => Promise<number>;
const exitCode: Exec = (command, args) =>
  new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, timeout: 15_000 }, (error) => resolve(error ? 1 : 0));
  });

/** Whether the laptop can build: Docker is running and the pipeline image exists. */
export async function pipelineHealth(exec: Exec = exitCode): Promise<PipelineHealth> {
  if ((await exec('docker', ['info'])) !== 0) return 'no-docker';
  if ((await exec('docker', ['image', 'inspect', IMAGE])) !== 0) return 'no-image';
  return 'ready';
}

/** Removes a job's database volume. Never throws: a volume that stays behind is swept up when the server next starts. */
export async function removeJobVolume(jobId: string, exec: Exec = exitCode): Promise<void> {
  try {
    const code = await exec('docker', ['volume', 'rm', '-f', jobVolume(jobId)]);
    if (code !== 0) console.error(`Couldn't remove volume ${jobVolume(jobId)} (exit ${code})`);
  } catch (error) {
    console.error(`Couldn't remove volume ${jobVolume(jobId)}:`, error);
  }
}

type ExecOut = (command: string, args: string[]) => Promise<string>;
const stdoutOf: ExecOut = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, timeout: 30_000 }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });

/** Removes pipeline containers and database volumes (rr-*) left over from a server that died mid-build. Returns how many; 0 if Docker fails. */
export async function removeLeftoverContainers(exec: ExecOut = stdoutOf): Promise<number> {
  try {
    const ids = (await exec('docker', ['ps', '-aq', '--filter', 'name=^rr-'])).split(/\s+/).filter(Boolean);
    for (const id of ids) await exec('docker', ['rm', '-f', id]);
    const volumes = (await exec('docker', ['volume', 'ls', '-q', '--filter', 'name=^rr-'])).split(/\s+/).filter(Boolean);
    for (const volume of volumes) await exec('docker', ['volume', 'rm', '-f', volume]);
    return ids.length;
  } catch (error) {
    console.error("Couldn't check for leftover containers:", error);
    return 0;
  }
}
