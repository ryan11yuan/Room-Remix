'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HeroScene } from '@/lib/hero/HeroScene';
import { downloadSplat, fetchCameras } from '@/lib/splatJobs/client';
import type { RoomSummary } from '@/lib/splatJobs/protocol';
import { RoomSketch } from './RoomSketch';
import { useReducedMotion } from './useReducedMotion';
import { markWebGLUnavailable, useWebGL } from './useWebGL';

type Status = 'loading' | 'ready' | 'error';

/**
 * The plinth: the newest room, live, pinned behind the sections passed in as children while they scroll over it. The
 * drawn room stands in until the splat develops, and stays when there's no room or no 3D.
 */
export function RoomStage({ id, room, children }: { id: string; room: RoomSummary | null; children: ReactNode }) {
  const webgl = useWebGL();
  const still = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  const roomId = room?.id ?? null;
  const [shownRoom, setShownRoom] = useState(roomId);
  if (shownRoom !== roomId) {
    setShownRoom(roomId);
    setStatus('loading');
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!webgl || !canvas || !wrap || !roomId) return;
    let scene: HeroScene;
    try {
      scene = new HeroScene(canvas, still);
    } catch (error) {
      console.error(error);
      markWebGLUnavailable();
      return;
    }
    const resize = new ResizeObserver(([entry]) => scene.resize(entry.contentRect.width, entry.contentRect.height));
    resize.observe(canvas);
    const onScreen = new IntersectionObserver(([entry]) => scene.setRunning(entry.isIntersecting));
    onScreen.observe(wrap);
    const scrolled = () => {
      const box = wrap.getBoundingClientRect();
      scene.setProgress(-box.top / Math.max(box.height - window.innerHeight, 1));
    };
    const pointed = (event: PointerEvent) =>
      scene.setPointer((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
    scrolled();
    window.addEventListener('scroll', scrolled, { passive: true });
    window.addEventListener('pointermove', pointed, { passive: true });
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
      resize.disconnect();
      onScreen.disconnect();
      window.removeEventListener('scroll', scrolled);
      window.removeEventListener('pointermove', pointed);
      scene.dispose();
    };
  }, [webgl, roomId, still]);

  const developed = webgl && roomId !== null && status === 'ready';
  return (
    <div ref={wrapRef} id={id} className="relative">
      <div className="absolute inset-0">
        <div className="sticky top-0 h-svh overflow-hidden">
          <RoomSketch
            className={`absolute left-1/2 top-1/2 w-[min(78vw,560px)] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-[1400ms] ease-develop ${developed ? 'opacity-0' : 'opacity-100'}`}
          />
          {webgl && roomId && (
            <canvas
              ref={canvasRef}
              role="img"
              aria-label="Your newest room in 3D"
              className={`absolute inset-0 block h-full w-full ${developed ? 'motion-safe:animate-[develop_2.4s_var(--ease-develop)_both]' : 'opacity-0'}`}
            />
          )}
          <div aria-hidden className="vignette pointer-events-none absolute inset-0" />
        </div>
      </div>
      {children}
    </div>
  );
}
