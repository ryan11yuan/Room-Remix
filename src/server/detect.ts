import { readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Detection, DetectionsFile, FrameDetections } from '@/lib/splatJobs/protocol';

/** What the detector looks for (spec 2026-10-07 sound §3.1). `desk` comes back as `table`. */
export const DETECT_LABELS = [
  'chair', 'sofa', 'table', 'desk', 'whiteboard', 'television', 'window', 'curtains', 'rug', 'bookshelf', 'bed', 'cabinet', 'plant',
] as const;
export const FRAME_COUNT = 12;
export const DETECTIONS_FILE = 'detections.json';
export const MODEL = 'Xenova/owlvit-base-patch32';
const PROMPT = 'a photo of a ';
const PIPELINE_THRESHOLD = 0.1; // the pipeline's own cut; cleanDetections applies the real per-label ones
const DEFAULT_THRESHOLD = 0.3;
const LABEL_THRESHOLDS: Record<string, number> = { whiteboard: 0.15, television: 0.15 }; // the spike: these score low even when right
const NMS_IOU = 0.5;
/** Model files live outside the repo (OneDrive) and outside node_modules, so a reinstall keeps them. */
export const MODEL_CACHE = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), '.cache'), 'RoomRemix', 'models');

/** One image in, its detections out (in that image's pixels). */
export type DetectFrame = (file: string) => Promise<{ width: number; height: number; detections: Detection[] }>;

/** Up to `count` image names spread evenly through the list, in numeric order, first and last included. */
export function pickFrames(names: string[], count = FRAME_COUNT): string[] {
  const sorted = names
    .filter((n) => /\.(jpe?g|png)$/i.test(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (sorted.length <= count) return sorted;
  return Array.from({ length: count }, (_, i) => sorted[Math.round((i * (sorted.length - 1)) / (count - 1))]);
}

const area = (b: Detection['box']) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
function iou(a: Detection['box'], b: Detection['box']): number {
  const inter = area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]);
  return inter / (area(a) + area(b) - inter || 1);
}

const CONTAINED = 0.8;
/** A whiteboard and a television are the same flat rectangle to the detector; every other label is its own group. */
const group = (label: string) => (label === 'whiteboard' || label === 'television' ? 'screen' : label);
/** The share of `a` that lies inside `b`. */
function covered(a: Detection['box'], b: Detection['box']): number {
  return area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]) / (area(a) || 1);
}

/** The pipeline gives every label above its threshold per box: keep the best label per box, threshold, then class-agnostic NMS. */
export function cleanDetections(raw: Detection[]): Detection[] {
  const bestPerBox = new Map<string, Detection>();
  for (const d of raw) {
    const label = d.label === 'desk' ? 'table' : d.label;
    const key = d.box.map((v) => Math.round(v * 2)).join(',');
    const seen = bestPerBox.get(key);
    if (!seen || d.score > seen.score) bestPerBox.set(key, { ...d, label });
  }
  const kept = [...bestPerBox.values()]
    .filter((d) => d.score >= (LABEL_THRESHOLDS[d.label] ?? DEFAULT_THRESHOLD))
    .sort((a, b) => b.score - a.score);
  const out: Detection[] = [];
  for (const d of kept) {
    if (!out.every((o) => iou(o.box, d.box) <= NMS_IOU)) continue;
    if (out.some((o) => group(o.label) === group(d.label) && covered(d.box, o.box) >= CONTAINED)) continue; // a part of a better box
    out.push(d);
  }
  return out;
}

/**
 * Detections for a job folder: read from detections.json, or computed once and saved. Concurrent calls share one run;
 * a failed run rejects and leaves nothing behind, so the next call tries again.
 */
export function createObjectFinder(detectFrame: DetectFrame): (dir: string) => Promise<DetectionsFile> {
  const running = new Map<string, Promise<DetectionsFile>>();
  return async (dir) => {
    const saved = path.join(dir, DETECTIONS_FILE);
    try {
      return JSON.parse(await readFile(saved, 'utf8')) as DetectionsFile;
    } catch {
      // not detected yet
    }
    let run = running.get(dir);
    if (!run) {
      run = (async () => {
        const images = path.join(dir, 'images');
        const frames: FrameDetections[] = [];
        for (const name of pickFrames(await readdir(images))) frames.push({ img_name: name, ...(await detectFrame(path.join(images, name))) });
        const file: DetectionsFile = { frames };
        await writeFile(saved, JSON.stringify(file));
        return file;
      })().finally(() => running.delete(dir));
      running.set(dir, run);
    }
    return run;
  };
}

type ZeroShotOutput = { score: number; label: string; box: { xmin: number; ymin: number; xmax: number; ymax: number } }[];
type ZeroShot = (image: unknown, labels: string[], options: { threshold: number }) => Promise<ZeroShotOutput>;

/** OWL-ViT through transformers.js on the CPU, loaded on first use (spec §3.1; settings from the Plan 8 spike). */
export function transformersDetector(): DetectFrame {
  let loading: Promise<{ detector: ZeroShot; RawImage: { read(file: string): Promise<{ width: number; height: number }> } }> | null = null;
  return async (file) => {
    loading ??= import('@huggingface/transformers').then(async (t) => {
      t.env.cacheDir = MODEL_CACHE;
      const detector = (await t.pipeline('zero-shot-object-detection', MODEL, { device: 'cpu' })) as unknown as ZeroShot;
      return { detector, RawImage: t.RawImage as never };
    }).catch((error) => {
      loading = null; // a failed load (download, corrupt file) is retried on the next call
      throw error;
    });
    const { detector, RawImage } = await loading;
    const image = await RawImage.read(file);
    const output = await detector(image, DETECT_LABELS.map((l) => PROMPT + l), { threshold: PIPELINE_THRESHOLD });
    const raw = output.map((o) => ({
      label: o.label.startsWith(PROMPT) ? o.label.slice(PROMPT.length) : o.label,
      score: o.score,
      box: [o.box.xmin, o.box.ymin, o.box.xmax, o.box.ymax] as Detection['box'],
    }));
    return { width: image.width, height: image.height, detections: cleanDetections(raw) };
  };
}
