import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { isQuality, MAX_VIDEO_BYTES, type DetectionsFile, type JobView, type PipelineHealth, type Quality, type RoomSummary } from '@/lib/splatJobs/protocol';

/** What the server needs from the job queue (JobQueue satisfies it). */
export interface Jobs {
  reserve(): Promise<{ id: string; dir: string }>;
  discard(id: string): Promise<void>;
  add(id: string, quality: Quality, videoName: string): Promise<JobView>;
  get(id: string): JobView | null;
  cancel(id: string): Promise<JobView | null>;
  splatPath(id: string): string | null;
  rooms(): RoomSummary[];
  camerasPath(id: string): string | null;
  jobDir(id: string): string | null;
}

export type ServerOptions = {
  jobs: Jobs;
  health: () => Promise<PipelineHealth>;
  /** True while a build is running: health then answers ready without asking Docker, which may be slow under load. */
  busy?: () => boolean;
  /** The static export (out/). */
  staticDir: string;
  maxBytes?: number;
  findObjects?: (dir: string) => Promise<DetectionsFile>;
};

const VIDEO_EXT: Record<string, string> = {
  'video/quicktime': 'mov',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'video/3gpp': '3gp',
};

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json',
};

type Req = http.IncomingMessage;
type Res = http.ServerResponse;

function sendJson(res: Res, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** The demo server (spec 2026-10-06 §3, §5): the static export plus the /api/splat jobs API. */
export function createServer({ jobs, health, busy, staticDir, maxBytes = MAX_VIDEO_BYTES, findObjects }: ServerOptions): http.Server {
  const root = path.resolve(staticDir);

  async function upload(req: Req, res: Res, quality: string | null): Promise<void> {
    if (!isQuality(quality)) {
      req.resume();
      return sendJson(res, 400, { error: 'quality' });
    }
    const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    const declared = Number(req.headers['content-length']);
    if (!type.startsWith('video/') || (Number.isFinite(declared) && declared > maxBytes)) {
      res.setHeader('Connection', 'close'); // don't wait for a body we're refusing
      req.resume();
      return sendJson(res, type.startsWith('video/') ? 413 : 415, { error: type.startsWith('video/') ? 'too-large' : 'not-video' });
    }
    const { id, dir } = await jobs.reserve();
    const videoName = `video.${VIDEO_EXT[type] ?? 'video'}`;
    let received = 0;
    // Past the limit, keep reading (so the phone gets its 413) but stop writing.
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        callback(null, received > maxBytes ? undefined : chunk);
      },
    });
    try {
      await pipeline(req, counter, createWriteStream(path.join(dir, videoName)));
    } catch (error) {
      await jobs.discard(id);
      const abandoned = req.destroyed || req.readableAborted;
      if (!abandoned) console.error(`Couldn't store the upload for job ${id}:`, error);
      // Cut off midway by the phone: nobody is left to answer. Otherwise (a write failure) say so.
      if (abandoned || res.headersSent) res.destroy();
      else sendJson(res, 500, { error: 'server' });
      return;
    }
    if (received > maxBytes) {
      await jobs.discard(id);
      return sendJson(res, 413, { error: 'too-large' });
    }
    if (received === 0) {
      await jobs.discard(id);
      return sendJson(res, 415, { error: 'not-video' });
    }
    return sendJson(res, 201, await jobs.add(id, quality, videoName));
  }

  async function sendSplat(res: Res, id: string): Promise<void> {
    if (!jobs.get(id)) return sendJson(res, 404, { error: 'not-found' });
    const file = jobs.splatPath(id);
    if (!file) return sendJson(res, 409, { error: 'not-ready' });
    const info = await stat(file);
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store' });
    await pipeline(createReadStream(file), res);
  }

  async function sendCameras(res: Res, id: string): Promise<void> {
    const file = jobs.camerasPath(id);
    const info = file ? await stat(file).catch(() => null) : null;
    if (!file || !info?.isFile()) return sendJson(res, 404, { error: 'no-cameras' });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': info.size, 'Cache-Control': 'no-store' });
    await pipeline(createReadStream(file), res);
  }

  async function sendObjects(res: Res, id: string): Promise<void> {
    const dir = jobs.jobDir(id);
    if (!dir || !findObjects) return sendJson(res, 404, { error: 'not-found' });
    try {
      return sendJson(res, 200, await findObjects(dir));
    } catch (error) {
      console.error(error);
      return sendJson(res, 500, { error: 'detect-failed' });
    }
  }

  async function api(req: Req, res: Res, url: URL, parts: string[]): Promise<void> {
    const [, resource, id, sub] = parts; // parts[0] is 'splat'
    const method = req.method ?? 'GET';
    if (resource === 'health' && !id && method === 'GET') return sendJson(res, 200, { pipeline: busy?.() ? 'ready' : await health() });
    if (resource === 'jobs' && !id && method === 'POST') return upload(req, res, url.searchParams.get('quality'));
    if (resource === 'jobs' && id && !sub && method === 'GET') {
      const job = jobs.get(id);
      return job ? sendJson(res, 200, job) : sendJson(res, 404, { error: 'not-found' });
    }
    if (resource === 'jobs' && id && !sub && method === 'DELETE') {
      const job = await jobs.cancel(id);
      return job ? sendJson(res, 200, job) : sendJson(res, 404, { error: 'not-found' });
    }
    if (resource === 'jobs' && id && sub === 'splat' && method === 'GET') return sendSplat(res, id);
    if (resource === 'rooms' && !id && method === 'GET') return sendJson(res, 200, jobs.rooms());
    if (resource === 'jobs' && id && sub === 'cameras' && method === 'GET') return sendCameras(res, id);
    if (resource === 'jobs' && id && sub === 'objects' && method === 'GET') return sendObjects(res, id);
    req.resume();
    return sendJson(res, 404, { error: 'not-found' });
  }

  async function sendFile(req: Req, res: Res, file: string, status: number, size: number): Promise<void> {
    res.writeHead(status, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': size,
      // Files under /_next/static/ are named by their content hash, so a phone can keep them for good.
      'Cache-Control': file.split(path.sep).join('/').includes('/_next/static/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') return void res.end();
    await pipeline(createReadStream(file), res);
  }

  async function notFound(req: Req, res: Res): Promise<void> {
    const page = path.join(root, '404.html');
    const info = await stat(page).catch(() => null);
    if (info?.isFile()) return sendFile(req, res, page, 404, info.size);
    res.writeHead(404);
    res.end();
  }

  /** Files from the export only: /room is room.html, a folder is its index.html. Anything resolving outside is a 404. */
  async function serveStatic(req: Req, res: Res, pathname: string): Promise<void> {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return notFound(req, res);
    }
    const candidates = decoded.endsWith('/') ? [`${decoded}index.html`] : [decoded, `${decoded}.html`, `${decoded}/index.html`];
    for (const candidate of candidates) {
      const file = path.resolve(root, `.${candidate}`);
      if (file !== root && !file.startsWith(root + path.sep)) return notFound(req, res);
      const info = await stat(file).catch(() => null);
      if (info?.isFile()) return sendFile(req, res, file, 200, info.size);
    }
    return notFound(req, res);
  }

  async function handle(req: Req, res: Res): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'api') {
      if (parts[1] !== 'splat') {
        req.resume();
        return sendJson(res, 404, { error: 'not-found' });
      }
      return api(req, res, url, parts.slice(1));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.resume();
      res.writeHead(405);
      return void res.end();
    }
    return serveStatic(req, res, url.pathname);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      // A phone navigating away mid-download is not worth a stack trace.
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code !== 'ERR_STREAM_PREMATURE_CLOSE' && code !== 'ECONNRESET') console.error(error);
      if (!res.headersSent) sendJson(res, 500, { error: 'server' });
      else res.destroy();
    });
  });
  server.requestTimeout = 0; // a phone uploading a large video over Wi-Fi can take longer than Node's 5-minute default
  return server;
}
