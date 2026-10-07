import { describe, expect, it, vi } from 'vitest';
import { cancelJob, downloadSplat, fetchHealth, fetchJob, uploadVideo, type Xhr } from './client';
import { MAX_VIDEO_BYTES, type JobView } from './protocol';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

class FakeXhr implements Xhr {
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: Blob | null = null;
  status = 0;
  responseText = '';
  upload: Xhr['upload'] = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: Blob) {
    this.body = body;
  }
  abort() {
    this.onabort?.();
  }
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }
}

const video = (type = 'video/quicktime') => new File([new Uint8Array([1, 2, 3])], 'IMG_0001.MOV', { type });
const queuedJob: JobView = { id: 'j1', quality: 'quick', state: 'queued', place: 0 };

describe('fetchHealth', () => {
  it('reads the pipeline state from the demo server', async () => {
    const fetchFn = vi.fn(async () => json({ pipeline: 'no-image' }));
    expect(await fetchHealth(fetchFn)).toEqual({ pipeline: 'no-image' });
    expect(fetchFn).toHaveBeenCalledWith('/api/splat/health', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }));
  });

  it('is null where the page is not served by the demo server', async () => {
    expect(await fetchHealth(async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }))).toBeNull();
    expect(await fetchHealth(async () => new Response('missing', { status: 404 }))).toBeNull();
    expect(await fetchHealth(async () => Promise.reject(new TypeError('Failed to fetch')))).toBeNull();
    expect(await fetchHealth(async () => json({ pipeline: 'maybe' }))).toBeNull();
  });
});

describe('uploadVideo', () => {
  it('posts the raw video with its type to the quality URL and reports progress', async () => {
    const xhr = new FakeXhr();
    const progress: number[] = [];
    const file = video();
    const upload = uploadVideo(file, 'best', (fraction) => progress.push(fraction), () => xhr);
    expect([xhr.method, xhr.url, xhr.headers['Content-Type'], xhr.body]).toEqual(['POST', '/api/splat/jobs?quality=best', 'video/quicktime', file]);
    xhr.upload.onprogress?.({ loaded: 25, total: 100, lengthComputable: true });
    xhr.upload.onprogress?.({ loaded: 5, total: 0, lengthComputable: false });
    xhr.respond(201, queuedJob);
    expect(await upload.done).toEqual({ ok: true, job: queuedJob });
    expect(progress).toEqual([0.25]);
  });

  it('sends a file with no type as video/mp4 and lets the laptop decide', () => {
    const xhr = new FakeXhr();
    uploadVideo(video(''), 'quick', () => {}, () => xhr);
    expect(xhr.headers['Content-Type']).toBe('video/mp4');
  });

  it('refuses a file over 1 GB, or one that is not a video, without sending it', async () => {
    const big = video();
    Object.defineProperty(big, 'size', { value: MAX_VIDEO_BYTES + 1 });
    const makeXhr = vi.fn(() => new FakeXhr());
    expect(await uploadVideo(big, 'quick', () => {}, makeXhr).done).toEqual({ ok: false, reason: 'too-large' });
    expect(await uploadVideo(video('image/png'), 'quick', () => {}, makeXhr).done).toEqual({ ok: false, reason: 'not-video' });
    expect(makeXhr).not.toHaveBeenCalled();
  });

  it('tells the server refusals apart', async () => {
    const result = async (status: number) => {
      const xhr = new FakeXhr();
      const upload = uploadVideo(video(), 'quick', () => {}, () => xhr);
      xhr.respond(status, { error: 'x' });
      return upload.done;
    };
    expect(await result(413)).toEqual({ ok: false, reason: 'too-large' });
    expect(await result(415)).toEqual({ ok: false, reason: 'not-video' });
    expect(await result(500)).toEqual({ ok: false, reason: 'stopped' });
  });

  it('reports a dropped connection as stopped and Cancel as aborted', async () => {
    const dropped = new FakeXhr();
    const first = uploadVideo(video(), 'quick', () => {}, () => dropped);
    dropped.onerror?.();
    expect(await first.done).toEqual({ ok: false, reason: 'stopped' });
    const canceled = new FakeXhr();
    const second = uploadVideo(video(), 'quick', () => {}, () => canceled);
    second.abort();
    expect(await second.done).toEqual({ ok: false, reason: 'aborted' });
  });
});

describe('fetchJob', () => {
  it('passes the job through, including a job failed by a laptop restart', async () => {
    const failed: JobView = { id: 'j1', quality: 'quick', state: 'failed', error: { code: 'restarted', message: 'The laptop restarted while building. Start again.' } };
    const fetchFn = vi.fn(async () => json(failed));
    expect(await fetchJob('j1', fetchFn)).toEqual({ kind: 'job', job: failed });
    expect(fetchFn).toHaveBeenCalledWith('/api/splat/jobs/j1', expect.objectContaining({ cache: 'no-store' }));
  });

  it('is gone on 404 and offline when the laptop cannot be reached', async () => {
    expect(await fetchJob('j1', async () => json({ error: 'not-found' }, 404))).toEqual({ kind: 'gone' });
    expect(await fetchJob('j1', async () => json({ error: 'server' }, 500))).toEqual({ kind: 'offline' });
    expect(await fetchJob('j1', async () => Promise.reject(new TypeError('Failed to fetch')))).toEqual({ kind: 'offline' });
  });
});

describe('cancelJob and downloadSplat', () => {
  it('cancels with DELETE, and shrugs off a laptop that is gone', async () => {
    const fetchFn = vi.fn(async () => json(queuedJob));
    await cancelJob('j 1', fetchFn);
    expect(fetchFn).toHaveBeenCalledWith('/api/splat/jobs/j%201', { method: 'DELETE' });
    await expect(cancelJob('j1', async () => Promise.reject(new TypeError('Failed to fetch')))).resolves.toBeUndefined();
  });

  it('downloads the splat as a .spz file for the scan loader, and throws when it is not there', async () => {
    const file = await downloadSplat('j1', async () => new Response(new Uint8Array([83, 80, 90])));
    expect(file.name).toBe('video-scan.spz');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([83, 80, 90]));
    await expect(downloadSplat('j1', async () => json({ error: 'not-ready' }, 409))).rejects.toThrow();
  });
});
