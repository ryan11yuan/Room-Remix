'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { computeRayPaths } from '@/lib/acoustics/rays';
import { withoutFixes } from '@/lib/acoustics/simulate';
import type { ListenMode } from '@/lib/audio/mix';
import { LIMITS } from '@/lib/room/constants';
import { applyDrag, clampPosition, panelAt, panelOverlaps } from '@/lib/room/placement';
import { useRoomStore } from '@/lib/room/store';
import type { CameraPreset } from '@/lib/scene/layout';
import { RoomScene } from '@/lib/scene/RoomScene';

const PRESET_LABELS: Record<CameraPreset, string> = { top: 'Top', corner: 'Corner', listener: "Listener's view" };
const SPEAKER_HEIGHTS = [
  { label: 'On the floor', y: 0.4 },
  { label: 'On a desk', y: 1.0 },
  { label: 'On a stand', y: 1.2 },
];
const LISTENER_HEIGHTS = [
  { label: 'Seated', y: 1.1 },
  { label: 'Standing', y: 1.6 },
];
const buttonClass = 'rounded-md border border-neutral-700 px-3 py-1.5 disabled:opacity-40';

let webglSupport: boolean | undefined;
const webglListeners = new Set<() => void>();
function subscribeWebGL(listener: () => void) {
  webglListeners.add(listener);
  return () => {
    webglListeners.delete(listener);
  };
}
/** The renderer failed to start even though the probe passed: switch every view to the notice. */
function markWebGLUnavailable() {
  webglSupport = false;
  webglListeners.forEach((l) => l());
}
/** Probed once and cached: React calls this on every render, and browsers cap how many WebGL contexts can live. three.js needs WebGL 2. */
function hasWebGL(): boolean {
  if (webglSupport === undefined) {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      webglSupport = gl !== null;
      gl?.getExtension('WEBGL_lose_context')?.loseContext(); // free the probe context right away
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}

function HeightSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { label: string; y: number }[];
  value: number;
  onChange: (y: number) => void;
}) {
  const current = options.find((o) => Math.abs(o.y - value) < 0.005);
  return (
    <label className="flex items-center gap-1">
      <span className="text-neutral-400">{label}</span>
      <select
        value={current ? String(current.y) : 'custom'}
        onChange={(e) => {
          const y = Number(e.target.value);
          if (Number.isFinite(y)) onChange(y);
        }}
        className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1"
      >
        {!current && <option value="custom">{value.toFixed(2)} m</option>}
        {options.map((o) => (
          <option key={o.label} value={String(o.y)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RoomView({ mode }: { mode: ListenMode }) {
  const webgl = useSyncExternalStore(subscribeWebGL, hasWebGL, () => true);
  const room = useRoomStore((s) => s.room);
  const update = useRoomStore((s) => s.update);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<RoomScene | null>(null);
  const [raysOn, setRaysOn] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const withFixes = mode.room && mode.fixes;
  const paths = useMemo(() => computeRayPaths(withFixes ? room : withoutFixes(room)), [room, withFixes]);
  const panelCount = room.fixes.filter((f) => f.kind === 'panel').length;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    // `webgl` is the server's `true` during hydration, so ask the probe too: this effect can run before the store catches up.
    if (!webgl || !hasWebGL() || !canvas || !container) return;
    let scene: RoomScene;
    try {
      scene = new RoomScene(canvas, {
        onDrag: (target, point) => update((r) => applyDrag(r, target, point)),
        onWallTap: (wall, point) => {
          let refusal: string | null = null;
          update((r) => {
            if (r.fixes.filter((f) => f.kind === 'panel').length >= LIMITS.maxPanels) {
              refusal = `You've placed the maximum of ${LIMITS.maxPanels} panels.`;
              return r;
            }
            const panel = panelAt(r.dims, wall, point);
            if (panelOverlaps(r, panel)) {
              refusal = "Panels can't overlap. Tap an empty part of a wall.";
              return r;
            }
            return { ...r, fixes: [...r.fixes, panel] };
          });
          setMessage(refusal);
          if (!refusal) setPlacing(false);
        },
      });
    } catch {
      markWebGLUnavailable(); // re-renders to the notice through the store
      return;
    }
    sceneRef.current = scene;
    const observer = new ResizeObserver(([entry]) => scene.resize(entry.contentRect.width, entry.contentRect.height));
    observer.observe(container);
    return () => {
      observer.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [webgl, update]);

  useEffect(() => {
    sceneRef.current?.setRoom(room);
  }, [room, webgl]);

  useEffect(() => {
    sceneRef.current?.setPaths(paths);
  }, [paths, webgl]);

  useEffect(() => {
    sceneRef.current?.setRaysVisible(raysOn);
  }, [raysOn, webgl]);

  useEffect(() => {
    sceneRef.current?.setPlacingPanel(placing);
  }, [placing, webgl]);

  if (!webgl) {
    return (
      <p className="rounded-xl border border-neutral-800 p-4 text-sm text-neutral-400">
        The 3D view needs WebGL, which this browser doesn&apos;t provide. Use the number fields below to place the
        speaker, listener, rug and panels.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-2" aria-label="3D view of your room">
      <div ref={containerRef} className="relative h-[55vh] min-h-80 overflow-hidden rounded-xl border border-neutral-800">
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none"
          aria-label="Your room in 3D. Drag the speaker, listener or rug to move them."
        />
        {placing && (
          <p className="pointer-events-none absolute inset-x-0 top-2 text-center text-sm text-amber-200">
            Tap a wall to place the panel
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(Object.keys(PRESET_LABELS) as CameraPreset[]).map((preset) => (
          <button key={preset} onClick={() => sceneRef.current?.setCameraPreset(room, preset)} className={buttonClass}>
            {PRESET_LABELS[preset]}
          </button>
        ))}
        <button aria-pressed={raysOn} onClick={() => setRaysOn((v) => !v)} className={buttonClass}>
          {raysOn ? 'Hide rays' : 'Show rays'}
        </button>
        <button
          aria-pressed={placing}
          disabled={!placing && panelCount >= LIMITS.maxPanels}
          onClick={() => {
            setPlacing((v) => !v);
            setMessage(null);
          }}
          className={buttonClass}
        >
          {placing ? 'Cancel panel' : 'Place panel'}
        </button>
        <HeightSelect
          label="Speaker"
          options={SPEAKER_HEIGHTS}
          value={room.speaker.y}
          onChange={(y) => update((r) => ({ ...r, speaker: clampPosition(r.dims, { ...r.speaker, y }) }))}
        />
        <HeightSelect
          label="Listener"
          options={LISTENER_HEIGHTS}
          value={room.listener.y}
          onChange={(y) =>
            update((r) => ({ ...r, listener: { ...clampPosition(r.dims, { ...r.listener, y }), yaw: r.listener.yaw } }))
          }
        />
      </div>
      <p className="text-xs text-neutral-500">
        Drag the speaker (orange), the listener (blue) or the rug. One finger turns the view; two fingers zoom and pan.
        Rays show the room as you&apos;re hearing it.
      </p>
      {message && (
        <p role="status" className="text-sm text-amber-200">
          {message}
        </p>
      )}
    </section>
  );
}
