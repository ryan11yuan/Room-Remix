import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHECKED_FILE } from '@/lib/explore/checked';
import type { DetectionsFile, JobView, Quality, RoomSummary } from '@/lib/splatJobs/protocol';
import { createServer, type Jobs } from './server';

function fakeJobs(root: string) {
  const state = {
    reserved: 0,
    added: [] as { id: string; quality: Quality; videoName: string }[],
    discarded: [] as string[],
    canceled: [] as string[],
    views: new Map<string, JobView>(),
    splat: null as string | null,
    rooms: [] as RoomSummary[],
    cameras: new Map<string, string>(),
    ready: new Set<string>(),
    findObjects: async (_dir: string): Promise<DetectionsFile> => ({ frames: [] }),
  };
  const jobs: Jobs = {
    async reserve() {
      const id = `job${++state.reserved}`;
      const dir = path.join(root, id);
      await mkdir(dir, { recursive: true });
      return { id, dir };
    },
    async discard(id) {
      state.discarded.push(id);
    },
    async add(id, quality, videoName) {
      state.added.push({ id, quality, videoName });
      const view: JobView = { id, quality, state: 'queued', place: 0 };
      state.views.set(id, view);
      return view;
    },
    get: (id) => state.views.get(id) ?? null,
    async cancel(id) {
      const view = state.views.get(id);
      if (view) state.canceled.push(id);
      return view ? { ...view, state: 'canceled' } : null;
    },
    splatPath: (id) => (state.views.get(id)?.state === 'ready' ? state.splat : null),
    rooms: () => state.rooms,
    camerasPath: (id) => state.cameras.get(id) ?? null,
    jobDir: (id) => (state.ready.has(id) ? path.join(root, id) : null),
  };
  return { jobs, state };
}

let tmp: string;
let server: http.Server;
let base: string;
let fake: ReturnType<typeof fakeJobs>;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'rr-server-'));
  const out = path.join(tmp, 'out');
  await mkdir(path.join(out, '_next', 'static'), { recursive: true });
  await writeFile(path.join(out, 'index.html'), '<p>landing</p>');
  await writeFile(path.join(out, 'room.html'), '<p>room</p>');
  await writeFile(path.join(out, '404.html'), '<p>missing</p>');
  await writeFile(path.join(out, '_next', 'static', 'app.js'), 'console.log(1)');
  await writeFile(path.join(tmp, 'secret.txt'), 'secret');
  fake = fakeJobs(path.join(tmp, 'jobs'));
  server = createServer({ jobs: fake.jobs, health: async () => 'no-image', findObjects: (dir) => fake.state.findObjects(dir), staticDir: out, maxBytes: 64 });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

/** POSTs with chunked encoding (no Content-Length), as a phone streaming a big file would look. */
function postChunked(url: string, chunks: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'video/mp4', 'Transfer-Encoding': 'chunked' } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

describe('static files', () => {
  it('serves the export: / as index.html, /room as room.html, assets with their type, unknown paths as 404.html', async () => {
    const landing = await fetch(`${base}/`);
    expect(landing.headers.get('content-type')).toContain('text/html');
    expect(await landing.text()).toBe('<p>landing</p>');
    expect(await (await fetch(`${base}/room`)).text()).toBe('<p>room</p>');
    const js = await fetch(`${base}/_next/static/app.js?v=1`);
    expect(js.headers.get('content-type')).toContain('text/javascript');
    expect(js.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(landing.headers.get('cache-control')).toBe('no-cache');
    const missing = await fetch(`${base}/nowhere`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe('<p>missing</p>');
  });

  it('never serves a file outside the export', async () => {
    for (const trick of ['/..%2fsecret.txt', '/..%5csecret.txt', '/%2e%2e/secret.txt', '/_next/..%2f..%2fsecret.txt']) {
      const res = await fetch(`${base}${trick}`);
      expect(res.status).toBe(404);
      expect(await res.text()).not.toContain('secret');
    }
  });

  it('allows a long upload: no request timeout', () => {
    expect(server.requestTimeout).toBe(0);
  });
});

describe('jobs API', () => {
  it('reports the pipeline health', async () => {
    const res = await fetch(`${base}/api/splat/health`);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ pipeline: 'no-image' });
  });

  it('answers ready without asking docker while a build is running', async () => {
    const health = vi.fn(async () => 'no-docker' as const);
    const busy = createServer({ jobs: fake.jobs, health, staticDir: tmp, busy: () => true });
    await new Promise<void>((resolve) => busy.listen(0, '127.0.0.1', resolve));
    try {
      const res = await fetch(`http://127.0.0.1:${(busy.address() as AddressInfo).port}/api/splat/health`);
      expect(await res.json()).toEqual({ pipeline: 'ready' });
      expect(health).not.toHaveBeenCalled();
    } finally {
      busy.closeAllConnections();
      await new Promise<void>((resolve) => busy.close(() => resolve()));
    }
  });

  it('stores an uploaded video in a new job folder and queues it', async () => {
    const res = await fetch(`${base}/api/splat/jobs?quality=quick`, {
      method: 'POST',
      headers: { 'Content-Type': 'video/quicktime' },
      body: 'moov-bytes',
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'job1', quality: 'quick', state: 'queued', place: 0 });
    expect(fake.state.added).toEqual([{ id: 'job1', quality: 'quick', videoName: 'video.mov' }]);
    expect(await readFile(path.join(tmp, 'jobs', 'job1', 'video.mov'), 'utf8')).toBe('moov-bytes');
  });

  it('refuses a bad quality, a non-video and an empty upload', async () => {
    const post = (query: string, type: string, body: string) =>
      fetch(`${base}/api/splat/jobs${query}`, { method: 'POST', headers: { 'Content-Type': type }, body });
    expect((await post('?quality=fast', 'video/mp4', 'x')).status).toBe(400);
    expect((await post('?quality=best', 'image/jpeg', 'x')).status).toBe(415);
    expect((await post('?quality=best', 'video/mp4', '')).status).toBe(415);
    expect(fake.state.added).toEqual([]);
    expect(fake.state.discarded).toEqual(['job1']); // only the empty upload got as far as a folder
  });

  it('refuses a video over the size limit, whether declared or streamed', async () => {
    const declared = await fetch(`${base}/api/splat/jobs?quality=quick`, {
      method: 'POST',
      headers: { 'Content-Type': 'video/mp4' },
      body: 'x'.repeat(100),
    });
    expect(declared.status).toBe(413);
    expect(await postChunked(`${base}/api/splat/jobs?quality=quick`, ['x'.repeat(50), 'x'.repeat(50)])).toBe(413);
    expect(fake.state.added).toEqual([]);
    expect(fake.state.discarded).toEqual(['job1']);
  });

  it('throws away the folder of an upload cut off midway, and queues nothing', async () => {
    const req = http.request(`${base}/api/splat/jobs?quality=best`, {
      method: 'POST',
      headers: { 'Content-Type': 'video/mp4', 'Transfer-Encoding': 'chunked' },
    });
    req.on('error', () => {}); // destroyed on purpose below
    req.write('partial');
    await vi.waitFor(() => expect(fake.state.reserved).toBe(1));
    req.destroy();
    await vi.waitFor(() => expect(fake.state.discarded).toEqual(['job1']));
    expect(fake.state.added).toEqual([]);
  });

  it('answers job status, cancels, and serves a ready splat', async () => {
    expect((await fetch(`${base}/api/splat/jobs/nope`)).status).toBe(404);
    expect((await fetch(`${base}/api/splat/jobs/nope`, { method: 'DELETE' })).status).toBe(404);
    expect((await fetch(`${base}/api/splat/jobs/nope/splat`)).status).toBe(404);
    fake.state.views.set('a', { id: 'a', quality: 'quick', state: 'training', progress: { done: 10, total: 2000 } });
    expect(await (await fetch(`${base}/api/splat/jobs/a`)).json()).toEqual({
      id: 'a', quality: 'quick', state: 'training', progress: { done: 10, total: 2000 },
    });
    expect((await fetch(`${base}/api/splat/jobs/a/splat`)).status).toBe(409);
    expect(await (await fetch(`${base}/api/splat/jobs/a`, { method: 'DELETE' })).json()).toMatchObject({ state: 'canceled' });
    expect(fake.state.canceled).toEqual(['a']);
    const splat = path.join(tmp, 'splat.spz');
    await writeFile(splat, 'SPZ!');
    fake.state.splat = splat;
    fake.state.views.set('a', { id: 'a', quality: 'quick', state: 'ready' });
    const res = await fetch(`${base}/api/splat/jobs/a/splat`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(await res.text()).toBe('SPZ!');
  });

  it('lists the finished rooms', async () => {
    fake.state.rooms = [{ id: 'b', quality: 'best', createdAt: 2 }, { id: 'a', quality: 'quick', createdAt: 1 }];
    const res = await fetch(`${base}/api/splat/rooms`);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual(fake.state.rooms);
  });

  it('serves a room cameras file, and 404s when the job or the file is missing', async () => {
    const file = path.join(tmp, 'cameras.json');
    await writeFile(file, '[{"id":0}]');
    fake.state.cameras.set('with', file);
    fake.state.cameras.set('older', path.join(tmp, 'no-such-cameras.json'));
    const ok = await fetch(`${base}/api/splat/jobs/with/cameras`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toContain('application/json');
    expect(await ok.text()).toBe('[{"id":0}]');
    expect((await fetch(`${base}/api/splat/jobs/older/cameras`)).status).toBe(404);
    const unknown = await fetch(`${base}/api/splat/jobs/nope/cameras`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'no-cameras' });
  });

  it('serves a room objects detection, 404s for an unknown job, and 500s when detection fails', async () => {
    fake.state.ready.add('r1');
    const asked: string[] = [];
    fake.state.findObjects = async (dir) => {
      asked.push(dir);
      return { frames: [] };
    };
    const ok = await fetch(`${base}/api/splat/jobs/r1/objects`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ frames: [] });
    expect(asked).toEqual([path.join(tmp, 'jobs', 'r1')]);
    expect((await fetch(`${base}/api/splat/jobs/nope/objects`)).status).toBe(404);
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    fake.state.findObjects = async () => {
      throw new Error('model broke');
    };
    const bad = await fetch(`${base}/api/splat/jobs/r1/objects`);
    quiet.mockRestore();
    expect(bad.status).toBe(500);
    expect(await bad.json()).toEqual({ error: 'detect-failed' });
  });

  it('saves a checked list and serves it back; 404 before saving and for unknown jobs', async () => {
    fake.state.ready.add('r1');
    await mkdir(path.join(tmp, 'jobs', 'r1'), { recursive: true });
    const url = `${base}/api/splat/jobs/r1/checked`;
    expect((await fetch(url)).status).toBe(404);
    const objects = [{ label: 'door', min: { x: 0, y: 0, z: 1 }, max: { x: 0.1, y: 2, z: 2 } }];
    const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ objects }) });
    expect(put.status).toBe(204);
    const got = await fetch(url);
    expect(got.status).toBe(200);
    expect(await got.json()).toEqual({ objects });
    expect(JSON.parse(await readFile(path.join(tmp, 'jobs', 'r1', CHECKED_FILE), 'utf8'))).toEqual({ objects });
    expect((await fetch(`${base}/api/splat/jobs/nope/checked`)).status).toBe(404);
    expect((await fetch(`${base}/api/splat/jobs/nope/checked`, { method: 'PUT', body: '{"objects":[]}' })).status).toBe(404);
  });

  it('refuses a bad checked list with 400 and an oversized one with 413', async () => {
    fake.state.ready.add('r1');
    await mkdir(path.join(tmp, 'jobs', 'r1'), { recursive: true });
    const put = (body: string) => fetch(`${base}/api/splat/jobs/r1/checked`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
    const door = { label: 'door', min: { x: 0, y: 0, z: 1 }, max: { x: 0.1, y: 2, z: 2 } };
    for (const body of [
      'not json',
      '{}',
      JSON.stringify({ objects: [{ ...door, label: 'lamp' }] }),
      JSON.stringify({ objects: [{ ...door, min: { x: 1, y: 0, z: 1 } }] }),
      JSON.stringify({ objects: Array.from({ length: 201 }, () => door) }),
    ]) {
      const res = await put(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad-objects' });
    }
    const big = await put(JSON.stringify({ objects: [], pad: 'x'.repeat(70_000) }));
    expect(big.status).toBe(413);
  });

  it('treats a corrupt checked file as no checked list', async () => {
    fake.state.ready.add('r1');
    await mkdir(path.join(tmp, 'jobs', 'r1'), { recursive: true });
    await writeFile(path.join(tmp, 'jobs', 'r1', CHECKED_FILE), 'garbage');
    expect((await fetch(`${base}/api/splat/jobs/r1/checked`)).status).toBe(404);
    await writeFile(path.join(tmp, 'jobs', 'r1', CHECKED_FILE), JSON.stringify({ objects: [{ label: 'lamp' }] }));
    expect((await fetch(`${base}/api/splat/jobs/r1/checked`)).status).toBe(404);
  });

  it('answers unknown API paths and methods with 404 JSON', async () => {
    const res = await fetch(`${base}/api/splat/nothing`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not-found' });
    expect((await fetch(`${base}/api/splat/health`, { method: 'POST' })).status).toBe(404);
  });
});
