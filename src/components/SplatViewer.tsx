'use client';

import { useEffect, useRef, useState } from 'react';
import { downloadSplat, fetchCameras } from '@/lib/splatJobs/client';
import { ViewerScene } from '@/lib/viewer/ViewerScene';
import { markWebGLUnavailable, useWebGL } from './useWebGL';

const HELP = 'Drag to spin · Scroll to zoom · W A S D to move · Q / E down and up · Click to look around, Esc to stop';
type Status = 'loading' | 'ready' | 'error';

/** One room, full screen (spec 2026-10-07 §4). */
export function SplatViewer({ roomId, onBack }: { roomId: string; onBack: () => void }) {
  const webgl = useWebGL();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  // Another room: back to loading (set during render, like RoomView's room switch, not in an effect).
  const [shownRoom, setShownRoom] = useState(roomId);
  if (shownRoom !== roomId) {
    setShownRoom(roomId);
    setStatus('loading');
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!webgl || !canvas) return;
    let scene: ViewerScene;
    try {
      scene = new ViewerScene(canvas);
    } catch (error) {
      console.error(error);
      markWebGLUnavailable(); // re-renders to the "can't show 3D" line through the store
      return;
    }
    const observer = new ResizeObserver(([entry]) => scene.resize(entry.contentRect.width, entry.contentRect.height));
    observer.observe(canvas);
    let live = true;
    void Promise.all([downloadSplat(roomId), fetchCameras(roomId)])
      .then(async ([file, cameras]) => {
        const bytes = await file.arrayBuffer();
        if (!live) return;
        await scene.open(bytes, cameras);
        if (live) setStatus('ready');
      })
      .catch((error: unknown) => {
        console.error(error);
        if (live) setStatus('error');
      });
    return () => {
      live = false;
      observer.disconnect();
      scene.dispose();
    };
  }, [webgl, roomId]);

  const message = !webgl
    ? "This browser can't show 3D."
    : status === 'loading'
      ? 'Loading your room…'
      : status === 'error'
        ? "Couldn't load this room."
        : '';

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950">
      {webgl && <canvas ref={canvasRef} className="block h-full w-full" aria-label="Your room in 3D" />}
      <button
        onClick={onBack}
        className="absolute left-4 top-4 inline-flex min-h-11 items-center rounded-md border border-neutral-700 bg-neutral-950/80 px-4"
      >
        Back
      </button>
      <p role="status" className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-lg text-neutral-200 empty:hidden">
        {message}
      </p>
      {status === 'ready' && webgl && (
        <p className="pointer-events-none absolute inset-x-0 bottom-4 px-4 text-center text-sm text-neutral-300">{HELP}</p>
      )}
    </div>
  );
}
