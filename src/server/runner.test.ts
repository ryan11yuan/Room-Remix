import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pipelineSteps } from '@/lib/splatJobs/settings';
import { dockerArgs, dockerRunner, IMAGE, lineSplitter, pipelineHealth } from './runner';

const steps = pipelineSteps('quick', 'video.mp4');
const probe = steps[0];
const training = steps[5];

const fakeChild = () => Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() });
const asChild = (child: ReturnType<typeof fakeChild>) => child as unknown as ChildProcess;
const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('dockerArgs', () => {
  it('runs a step in the pipeline image with the job folder at /job, named so it can be killed', () => {
    expect(dockerArgs('abc', 'C:\\jobs\\abc', probe)).toEqual([
      'run', '--rm', '--name', 'rr-abc-probe', '-v', 'C:\\jobs\\abc:/job', IMAGE, ...probe.args,
    ]);
  });

  it('gives OpenSplat the GPU', () => {
    expect(dockerArgs('abc', '/jobs/abc', training).slice(0, 6)).toEqual(['run', '--rm', '--gpus', 'all', '--name', 'rr-abc-training']);
  });
});

describe('lineSplitter', () => {
  it('splits on \\n, \\r\\n and \\r, across chunks, skips empty lines and flushes the rest at the end', () => {
    const lines: string[] = [];
    const split = lineSplitter((line) => lines.push(line));
    split.push('Step 1');
    split.push('0: 0.5\r\nStep 20: 0.4\rframe=  12\r');
    split.push('\n\nlast');
    split.end();
    expect(lines).toEqual(['Step 10: 0.5', 'Step 20: 0.4', 'frame=  12', 'last']);
  });
});

describe('dockerRunner', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'rr-runner-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true, maxRetries: 5 });
  });

  it('streams both outputs line by line, keeps a log and resolves with the exit code once the log is written', async () => {
    const spawned: { command: string; args: string[] }[] = [];
    const child = fakeChild();
    const run = dockerRunner((command, args) => {
      spawned.push({ command, args });
      return asChild(child);
    });
    const lines: string[] = [];
    const step = run('abc', dir, training, (line) => lines.push(line));
    child.stdout.write('Using CUDA\nStep 10: 0.2 [0%]\n');
    child.stderr.write('warning: slow\n');
    await tick();
    child.emit('close', 0);
    expect(await step.done).toBe(0);
    expect(spawned).toEqual([{ command: 'docker', args: dockerArgs('abc', dir, training) }]);
    expect(lines).toEqual(expect.arrayContaining(['Using CUDA', 'Step 10: 0.2 [0%]', 'warning: slow']));
    const log = await readFile(path.join(dir, 'logs', 'training.log'), 'utf8');
    expect(log).toContain('Step 10: 0.2 [0%]');
    expect(log).toContain('warning: slow');
  });

  it('kills a step by killing its container', () => {
    const spawned: string[][] = [];
    const run = dockerRunner((_command, args) => {
      spawned.push(args);
      return asChild(fakeChild());
    });
    run('abc', dir, training, () => {}).kill();
    expect(spawned[1]).toEqual(['kill', 'rr-abc-training']);
  });

  it('resolves -1 when docker cannot be started, and ignores a close after that', async () => {
    const child = fakeChild();
    const step = dockerRunner(() => asChild(child))('abc', dir, probe, () => {});
    child.emit('error', new Error('spawn docker ENOENT'));
    child.emit('close', null);
    expect(await step.done).toBe(-1);
    expect(await readFile(path.join(dir, 'logs', 'probe.log'), 'utf8')).toContain('ENOENT');
  });
});

describe('pipelineHealth', () => {
  it('needs Docker running and the pipeline image built', async () => {
    const exec = (codes: Record<string, number>) => async (_command: string, args: string[]) => codes[args[0]] ?? 0;
    expect(await pipelineHealth(exec({ info: 1 }))).toBe('no-docker');
    expect(await pipelineHealth(exec({ image: 1 }))).toBe('no-image');
    expect(await pipelineHealth(exec({}))).toBe('ready');
  });
});
