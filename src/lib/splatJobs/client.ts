import { MAX_VIDEO_BYTES, type Health, type JobView, type Quality } from './protocol';

/** Same origin: the demo server serves both the app and this API (spec 2026-10-06 §5). */
export const API = '/api/splat';

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
const browserFetch: Fetch = (input, init) => fetch(input, init);

type ProgressLike = { loaded: number; total: number; lengthComputable: boolean };
/** The part of XMLHttpRequest an upload uses (fetch can't report upload progress). */
export interface Xhr {
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  send(body: Blob): void;
  abort(): void;
  readonly status: number;
  readonly responseText: string;
  upload: { onprogress: ((event: ProgressLike) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
}
// The DOM's handler types take `this` and a full ProgressEvent, so the real thing needs a cast to this narrower shape.
const browserXhr = () => new XMLHttpRequest() as unknown as Xhr;

export type UploadFailure = 'too-large' | 'not-video' | 'stopped' | 'aborted';
export type UploadResult = { ok: true; job: JobView } | { ok: false; reason: UploadFailure };
export type JobPoll = { kind: 'job'; job: JobView } | { kind: 'gone' } | { kind: 'offline' };

const jobUrl = (id: string) => `${API}/jobs/${encodeURIComponent(id)}`;

/** The demo server's health, or null where this page isn't served by it (no server, `next dev`, a static host). */
export async function fetchHealth(fetchFn: Fetch = browserFetch): Promise<Health | null> {
  try {
    const res = await fetchFn(`${API}/health`, { cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) return null;
    const { pipeline } = (await res.json()) as Partial<Health>;
    return pipeline === 'ready' || pipeline === 'no-docker' || pipeline === 'no-image' ? { pipeline } : null;
  } catch {
    return null;
  }
}

/** Sends the video as the raw request body. `onProgress` gets the share sent, 0..1. */
export function uploadVideo(
  file: File,
  quality: Quality,
  onProgress: (fraction: number) => void,
  makeXhr: () => Xhr = browserXhr,
): { done: Promise<UploadResult>; abort(): void } {
  const type = file.type || 'video/mp4'; // no type: let the laptop's ffprobe decide
  if (file.size > MAX_VIDEO_BYTES) return { done: Promise.resolve({ ok: false, reason: 'too-large' }), abort: () => {} };
  if (!type.startsWith('video/')) return { done: Promise.resolve({ ok: false, reason: 'not-video' }), abort: () => {} };
  const xhr = makeXhr();
  const done = new Promise<UploadResult>((resolve) => {
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status === 201) {
        try {
          resolve({ ok: true, job: JSON.parse(xhr.responseText) as JobView });
        } catch {
          resolve({ ok: false, reason: 'stopped' });
        }
        return;
      }
      resolve({ ok: false, reason: xhr.status === 413 ? 'too-large' : xhr.status === 415 ? 'not-video' : 'stopped' });
    };
    xhr.onerror = () => resolve({ ok: false, reason: 'stopped' });
    xhr.onabort = () => resolve({ ok: false, reason: 'aborted' });
  });
  xhr.open('POST', `${API}/jobs?quality=${quality}`);
  xhr.setRequestHeader('Content-Type', type);
  xhr.send(file);
  return { done, abort: () => xhr.abort() };
}

export async function fetchJob(id: string, fetchFn: Fetch = browserFetch): Promise<JobPoll> {
  try {
    const res = await fetchFn(jobUrl(id), { cache: 'no-store' });
    if (res.status === 404) return { kind: 'gone' };
    if (!res.ok) return { kind: 'offline' };
    return { kind: 'job', job: (await res.json()) as JobView };
  } catch {
    return { kind: 'offline' };
  }
}

export async function cancelJob(id: string, fetchFn: Fetch = browserFetch): Promise<void> {
  try {
    await fetchFn(jobUrl(id), { method: 'DELETE' });
  } catch {
    // the laptop may be gone; the phone forgets the build either way
  }
}

/** The finished splat, as a File the scan loader reads like any exported .spz. */
export async function downloadSplat(id: string, fetchFn: Fetch = browserFetch): Promise<File> {
  const res = await fetchFn(`${jobUrl(id)}/splat`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Couldn't download the splat: ${res.status}`);
  return new File([await res.blob()], 'video-scan.spz', { type: 'application/octet-stream' });
}
