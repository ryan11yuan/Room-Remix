'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { downloadSplat, fetchCameras } from '@/lib/splatJobs/client';
import { ExploreController } from '@/lib/viewer/ExploreController';
import { ViewerScene } from '@/lib/viewer/ViewerScene';
import { Arrow } from './Arrow';
import { ExplorePanel } from './ExplorePanel';
import { markWebGLUnavailable, useWebGL } from './useWebGL';

/** The controls, as keycap and what it does. */
const HINTS: readonly [string, string][] = [
  ['Drag', 'Spin'],
  ['Scroll', 'Zoom'],
  ['W A S D', 'Move'],
  ['Q / E', 'Down / up'],
  ['Click', 'Look around'],
  ['Esc', 'Stop looking'],
];
type Status = 'loading' | 'ready' | 'error';

/** One room, full screen (spec 2026-10-07 §4), with check and explore modes (spec 2026-10-08 §6–9). */
export function SplatViewer({ roomId, title, onBack }: { roomId: string; title?: string; onBack: () => void }) {
  const webgl = useWebGL();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [explore, setExplore] = useState<ExploreController | null>(null);
  // Another room: back to loading (set during render, not in an effect).
  const [shownRoom, setShownRoom] = useState(roomId);
  if (shownRoom !== roomId) {
    setShownRoom(roomId);
    setStatus('loading');
    setExplore(null);
  }
  const subscribe = useCallback((listener: () => void) => explore?.subscribe(listener) ?? (() => {}), [explore]);
  const exploring = useSyncExternalStore(subscribe, () => explore?.getState().mode === 'exploring', () => false);

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
    let controller: ExploreController | null = null;
    void Promise.all([downloadSplat(roomId), fetchCameras(roomId)])
      .then(async ([file, cameras]) => {
        const bytes = await file.arrayBuffer();
        if (!live) return;
        await scene.open(bytes, cameras);
        if (!live) return;
        setStatus('ready');
        try {
          controller = ExploreController.create(scene, roomId, cameras);
          setExplore(controller);
        } catch (error) {
          console.error(error); // the room stays viewable without the panel
        }
      })
      .catch((error: unknown) => {
        console.error(error);
        if (live) setStatus('error');
      });
    return () => {
      live = false;
      observer.disconnect();
      controller?.dispose();
      scene.dispose();
    };
  }, [webgl, roomId]);

  const message = !webgl
    ? "This browser can't show 3D."
    : status === 'loading'
      ? 'Loading your room'
      : status === 'error'
        ? "Couldn't load this room."
        : '';

  return (
    <div className="darkroom fixed inset-0 z-50">
      {webgl && (
        <canvas
          ref={canvasRef}
          className={`block h-full w-full ${status === 'ready' ? 'motion-safe:animate-[develop_1.8s_var(--ease-develop)_both]' : 'opacity-0'}`}
          aria-label="Your room in 3D"
        />
      )}
      {/* Shade under the chrome so cream type reads over a bright room. Not decoration: it is where the labels sit. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-linear-to-b from-walnut/85 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-walnut/85 to-transparent" />

      <header className="absolute left-0 top-0 flex items-center gap-5 p-4 sm:p-6">
        <button onClick={onBack} className="ghost">
          <Arrow to="left" />
          Back
        </button>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-ui">Room Remix</span>
          {title && <span className="truncate text-label text-cream/70">{title}</span>}
        </div>
      </header>

      {message && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="flex w-72 max-w-full flex-col gap-4">
            <p role="status" className="text-heading-sm">
              {message}
            </p>
            {status === 'loading' && webgl && (
              <div aria-hidden className="h-px w-full overflow-hidden bg-cork">
                <div className="h-full w-1/3 bg-cream motion-safe:animate-[indeterminate_1.6s_ease-in-out_infinite]" />
              </div>
            )}
          </div>
        </div>
      )}

      {status === 'ready' && webgl && !exploring && (
        <ul
          aria-label="Controls"
          className="pointer-events-none absolute bottom-0 left-0 flex max-w-full flex-wrap gap-x-5 gap-y-3 p-4 text-label sm:p-6 lg:max-w-[62%]"
        >
          {HINTS.map(([key, does]) => (
            <li key={key} className="flex items-center gap-2">
              <kbd className="rounded-full border border-cream/60 px-2.5 py-1.5 font-[inherit] text-micro">{key}</kbd>
              <span>{does}</span>
            </li>
          ))}
        </ul>
      )}

      {status === 'ready' && webgl && explore && <ExplorePanel controller={explore} />}
    </div>
  );
}
