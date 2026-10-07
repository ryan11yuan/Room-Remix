'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { computeRayPaths } from '@/lib/acoustics/rays';
import { withoutFixes } from '@/lib/acoustics/simulate';
import type { ListenMode } from '@/lib/audio/mix';
import { LIMITS } from '@/lib/room/constants';
import { applyDrag, clampPosition, panelAt, panelOverlaps } from '@/lib/room/placement';
import { useRoomStore } from '@/lib/room/store';
import { formatLength, type Unit } from '@/lib/room/units';
import type { CameraPreset } from '@/lib/scene/layout';
import { RoomScene } from '@/lib/scene/RoomScene';
// Never import SplatLayer here (not even for SPLAT_WARN_COUNT): it would pull Spark into this page's bundle.
import { ScanController, scanStatusParts, SPLAT_WARN_COUNT, type ScanStatus, type ScanUiStep } from '@/lib/scene/ScanController';
import { NOT_RUNNING } from '@/lib/splatJobs/panel';
import { pendingScanRoom, returnPendingScan, setPendingScanForRoom, subscribePendingScan, takePendingScan } from './pendingScan';
import { TopView } from './TopView';
import { useReducedMotion } from './useReducedMotion';
import { useSplatHealth } from './useSplatHealth';
import { useUnits } from './useUnits';
import { useVideoScan } from './useVideoScan';
import { hasWebGL, markWebGLUnavailable, useWebGL } from './useWebGL';
import { VideoScanPanel, VideoScanProgress } from './VideoScanPanel';

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
const buttonClass = 'inline-flex min-h-11 items-center rounded-md border border-neutral-700 px-3 disabled:opacity-40';
const ONE_DEG = Math.PI / 180;
const FIVE_DEG = Math.PI / 36;
/** Fine-tuning steps for the scan, in the room's axes: x runs toward the back wall, z toward the left wall. */
const NUDGES: { label: string; change: { yaw?: number; scale?: number; x?: number; z?: number } }[] = [
  { label: 'Turn −5°', change: { yaw: -FIVE_DEG } },
  { label: 'Turn −1°', change: { yaw: -ONE_DEG } },
  { label: 'Turn +1°', change: { yaw: ONE_DEG } },
  { label: 'Turn +5°', change: { yaw: FIVE_DEG } },
  { label: 'Smaller', change: { scale: 0.99 } },
  { label: 'Bigger', change: { scale: 1.01 } },
  { label: '← Front', change: { x: -0.05 } },
  { label: 'Back →', change: { x: 0.05 } },
  { label: 'Right', change: { z: -0.05 } },
  { label: 'Left', change: { z: 0.05 } },
];

function alignBanner(step: Exclude<ScanUiStep, null>, taps: number): string {
  switch (step) {
    case 'floor':
      return `Step 1 of 3: tap 3 spots on the floor (${taps}/3)`;
    case 'corners':
      return `Step 2 of 3: tap the front-right floor corner, then the back-right one (${taps}/2). They're the two ends of the right wall as you face the front wall.`;
    case 'nudge':
      return 'Step 3 of 3: line the box up with your room';
  }
}

function HeightSelect({
  label,
  options,
  value,
  unit,
  onChange,
}: {
  label: string;
  options: { label: string; y: number }[];
  value: number;
  unit: Unit;
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
        className="min-h-11 rounded-md border border-neutral-700 bg-neutral-900 px-2"
      >
        {!current && <option value="custom">{`${formatLength(value, unit)} ${unit}`}</option>}
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
  const webgl = useWebGL();
  const [unit] = useUnits();
  const room = useRoomStore((s) => s.room);
  const update = useRoomStore((s) => s.update);
  const roomId = useRoomStore((s) => s.roomId);
  const pendingFor = useSyncExternalStore(subscribePendingScan, pendingScanRoom, () => null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<RoomScene | null>(null);
  const scanRef = useRef<ScanController | null>(null);
  const reducedMotion = useReducedMotion();
  const [raysChoice, setRaysChoice] = useState<boolean | null>(null); // null: the default, which is off for reduced motion
  const raysOn = raysChoice ?? !reducedMotion;
  const [placing, setPlacing] = useState(false);
  const [walking, setWalking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus>({ kind: 'none' });
  const [alignStep, setAlignStep] = useState<{ step: ScanUiStep; taps: number; hint: string | null }>({
    step: null,
    taps: 0,
    hint: null,
  });
  const health = useSplatHealth();
  const alignNext = useRef(false); // the next pending scan was built from a video: line it up as soon as it opens
  const onVideoReady = useCallback((file: File, forRoom: string) => {
    alignNext.current = true;
    setPendingScanForRoom(file, forRoom); // opened by the pending-scan effect, which waits while the view is busy
  }, []);
  const video = useVideoScan(roomId, onVideoReady);
  const [videoPanel, setVideoPanel] = useState(false);
  // Once a build starts (or an upload fails), its progress row takes over from the panel.
  if (videoPanel && video.state.kind !== 'idle' && video.state.kind !== 'uploading') setVideoPanel(false);
  // Another room was opened: walk mode, panel placing and any message stay behind with the room they belonged to.
  const [shownRoomId, setShownRoomId] = useState(roomId);
  if (roomId !== shownRoomId) {
    setShownRoomId(roomId);
    setWalking(false);
    setPlacing(false);
    setMessage(null);
    setVideoPanel(false);
  }
  const aligning = alignStep.step !== null;
  const picking = alignStep.step === 'floor' || alignStep.step === 'corners'; // choosing points on the scan: the camera stays on it
  const scanBusy = scanStatus.kind === 'loading' || aligning; // as the controller last reported it
  const scanReady = scanStatus.kind === 'ready' ? scanStatus : null;
  const scanLine = scanStatusParts(scanStatus);
  const largeScanWarning =
    scanReady && scanReady.count > SPLAT_WARN_COUNT
      ? `This scan has ${(scanReady.count / 1_000_000).toFixed(1)} million splats and may be slow on your phone.`
      : null;

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
        onScanTap: (point) => scanRef.current?.tap(point, useRoomStore.getState().room),
      });
    } catch (error) {
      console.error(error); // three logs WebGL context failures itself; this makes any other constructor bug visible
      markWebGLUnavailable(); // re-renders to the notice through the store
      return;
    }
    sceneRef.current = scene;
    // Each mount (React's strict mode runs this twice) gets its own controller; its reports arrive after an await or from a click.
    const scans = new ScanController(
      scene,
      {
        status: setScanStatus,
        step: (step, taps, hint) => setAlignStep({ step, taps, hint }),
      },
      useRoomStore.getState().roomId ?? 'unsaved', // the page shows this view only once a room is open
    );
    scanRef.current = scans;
    void scans.restore(useRoomStore.getState().room);
    const observer = new ResizeObserver(([entry]) => scene.resize(entry.contentRect.width, entry.contentRect.height));
    observer.observe(container);
    return () => {
      observer.disconnect();
      scans.dispose(); // before the scene: it takes its layer out of the scene
      scanRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
  }, [webgl, update]);

  useEffect(() => {
    sceneRef.current?.setRoom(room);
  }, [room, webgl]);

  useEffect(() => {
    scanRef.current?.setRoom(room); // keeps the scan's crop in step with the room size
  }, [room, webgl]);

  useEffect(() => {
    sceneRef.current?.setWalking(walking); // after setRoom above: walk mode starts from the scene's room
  }, [walking, webgl]);

  useEffect(() => {
    const scans = scanRef.current;
    if (!roomId || !scans || scans.roomKey === roomId) return; // the first room's scan is restored where the controller is made
    alignNext.current = false; // a video scan not opened before its room was left must not line up a later, unrelated scan
    const opened = useRoomStore.getState().room;
    sceneRef.current?.setCameraPreset(opened, 'corner'); // a different room: frame it afresh
    void scans.switchRoom(roomId, opened);
  }, [roomId, webgl]);

  // A scan picked in setup, once the session has opened setup's room. After the effect above, so the controller is
  // already on this room; open() takes over from switchRoom's restore of a scan the new room doesn't have.
  useEffect(() => {
    const scans = scanRef.current;
    if (!roomId || pendingFor !== roomId || !scans || scans.roomKey !== roomId) return;
    // open() refuses a file while a load or an alignment is under way: the scan keeps waiting, and this runs again
    // when that ends (scanBusy).
    if (scans.busy) return;
    const file = takePendingScan(roomId);
    if (!file) return;
    const align = alignNext.current;
    alignNext.current = false;
    void scans.open(file, useRoomStore.getState().room).then(() => {
      if (!align || scanRef.current !== scans || scans.roomKey !== roomId) return;
      // Built from a video: the three line-up steps begin at once (spec 2026-10-06 §6). A scan that didn't open is a no-op.
      setWalking(false);
      sceneRef.current?.setWalking(false);
      setPlacing(false);
      setMessage(null);
      scans.startAlignment();
    });
    // React's development double mount disposes this controller at once: hand the file back for the one that follows.
    return () =>
      queueMicrotask(() => {
        if (scanRef.current === scans) return;
        if (align) alignNext.current = true;
        returnPendingScan(roomId, file);
      });
  }, [roomId, pendingFor, webgl, scanBusy]);

  /** Leave walk mode now, not after the re-render: otherwise the next frame pulls the camera back to the listener's head. */
  const stopWalking = () => {
    setWalking(false);
    sceneRef.current?.setWalking(false);
  };

  useEffect(() => {
    sceneRef.current?.setPaths(paths);
  }, [paths, webgl]);

  useEffect(() => {
    sceneRef.current?.setRaysVisible(raysOn);
  }, [raysOn, webgl]);

  useEffect(() => {
    if (alignStep.step === 'floor' || alignStep.step === 'corners') return; // the scan controller owns the tap mode while picking points
    sceneRef.current?.setTapMode(placing ? 'panel' : 'none');
  }, [placing, alignStep.step, webgl]);

  if (!webgl) {
    return (
      <section aria-label="Top view of your room" className="flex flex-col gap-2">
        <p className="text-sm text-neutral-400">Your browser can&apos;t show the 3D view, so here&apos;s a top view.</p>
        <TopView room={room} onChange={update} unit={unit} label="Your room from above" />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2" aria-label="3D view of your room">
      <div ref={containerRef} className="relative h-[55vh] min-h-80 overflow-hidden rounded-xl border border-neutral-800">
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none"
          aria-label={
            walking
              ? 'Your room in 3D, walking. Tap the floor, or use WASD or the arrow keys, to walk the listener.'
              : 'Your room in 3D. Drag the speaker, listener or rug to move them.'
          }
        />
        {placing && (
          <p className="pointer-events-none absolute inset-x-0 top-2 text-center text-sm text-amber-200">
            Tap a wall to place the panel
          </p>
        )}
        {/* Mounted all the time, so a screen reader announces the first message when it appears. */}
        <div role="status" className="pointer-events-none absolute inset-x-0 top-2 flex flex-col items-center gap-1 px-3 text-center text-sm">
          {alignStep.step && (
            <p className="rounded-md bg-neutral-950/80 px-2 py-1 text-neutral-100">{alignBanner(alignStep.step, alignStep.taps)}</p>
          )}
          {alignStep.step && alignStep.hint && (
            <p className="rounded-md bg-neutral-950/80 px-2 py-1 text-amber-200">{alignStep.hint}</p>
          )}
        </div>
      </div>
      {aligning && (
        <div role="group" aria-label="Line up the scan" className="flex flex-wrap items-center gap-2 text-sm">
          {alignStep.step === 'nudge' && (
            <>
              {NUDGES.map((n) => (
                <button key={n.label} onClick={() => scanRef.current?.nudge(n.change, room)} className={buttonClass}>
                  {n.label}
                </button>
              ))}
              <button onClick={() => void scanRef.current?.finish(room)} className={buttonClass}>
                Done
              </button>
            </>
          )}
          <button onClick={() => scanRef.current?.cancelAlignment(room)} className={buttonClass}>
            Cancel
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(Object.keys(PRESET_LABELS) as CameraPreset[]).map((preset) => (
          <button
            key={preset}
            disabled={picking}
            onClick={() => {
              stopWalking();
              sceneRef.current?.setCameraPreset(room, preset);
            }}
            className={buttonClass}
          >
            {PRESET_LABELS[preset]}
          </button>
        ))}
        <button aria-pressed={walking} disabled={aligning} onClick={() => setWalking((v) => !v)} className={buttonClass}>
          {walking ? 'Stop walking' : 'Walk'}
        </button>
        <button aria-pressed={raysOn} onClick={() => setRaysChoice(!raysOn)} className={buttonClass}>
          {raysOn ? 'Hide rays' : 'Show rays'}
        </button>
        <button
          aria-pressed={placing}
          disabled={aligning || (!placing && panelCount >= LIMITS.maxPanels)}
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
          unit={unit}
          onChange={(y) => update((r) => ({ ...r, speaker: clampPosition(r.dims, { ...r.speaker, y }) }))}
        />
        <HeightSelect
          label="Listener"
          options={LISTENER_HEIGHTS}
          value={room.listener.y}
          unit={unit}
          onChange={(y) =>
            update((r) => ({ ...r, listener: { ...clampPosition(r.dims, { ...r.listener, y }), yaw: r.listener.yaw } }))
          }
        />
      </div>
      <div role="group" aria-label="Room scan" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-400">Room scan</span>
        <label
          className={`${buttonClass} cursor-pointer has-disabled:cursor-not-allowed has-disabled:opacity-40 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-neutral-300`}
        >
          {scanReady ? 'Replace scan' : 'Load scan'}
          <input
            type="file"
            accept=".ply,.spz,.splat,.ksplat"
            className="sr-only"
            disabled={scanStatus.kind === 'loading' || aligning}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ''; // so picking the same file again still fires
              if (file) void scanRef.current?.open(file, room);
            }}
          />
        </label>
        {health && (
          <button
            aria-expanded={videoPanel}
            disabled={health.pipeline !== 'ready' || video.state.kind !== 'idle'}
            onClick={() => setVideoPanel((open) => !open)}
            className={buttonClass}
          >
            Make from a video
          </button>
        )}
        {health && health.pipeline !== 'ready' && <span className="text-neutral-400">{NOT_RUNNING}</span>}
        {scanReady && !aligning && (
          <>
            <button
              onClick={() => {
                stopWalking(); // alignment frames the scan, and its floor taps aren't for walking
                setPlacing(false); // placing a panel and picking scan points both want the taps
                setMessage(null);
                scanRef.current?.startAlignment();
              }}
              className={buttonClass}
            >
              Align scan
            </button>
            <button aria-pressed={scanReady.visible} onClick={() => scanRef.current?.setVisible(!scanReady.visible)} className={buttonClass}>
              {scanReady.visible ? 'Hide scan' : 'Show scan'}
            </button>
          </>
        )}
        {/* While a scan loads, this is the way out of one that is slow or stuck. After an unreadable file the stored scan (if any) is still there; this clears it. */}
        {(scanReady || scanStatus.kind === 'error' || scanStatus.kind === 'loading') && !aligning && (
          <button onClick={() => void scanRef.current?.remove()} className={buttonClass}>
            Remove scan
          </button>
        )}
        <span role="status" className={`min-w-0 wrap-break-word ${scanStatus.kind === 'error' ? 'text-amber-200' : 'text-neutral-400'}`}>
          {scanLine.text}
          {scanLine.warning && <span className="text-amber-200">{scanLine.warning}</span>}
        </span>
      </div>
      {videoPanel && (video.state.kind === 'idle' || video.state.kind === 'uploading') && (
        <VideoScanPanel state={video.state} onStart={video.start} onCancel={video.cancel} />
      )}
      {(video.state.kind === 'building' || video.state.kind === 'downloading' || video.state.kind === 'failed') && (
        <VideoScanProgress state={video.state} onCancel={video.cancel} onDismiss={video.dismiss} onRetry={video.retry} />
      )}
      {/* Mounted all the time (see the banner); while empty, -mt-2 cancels the gap it would add. */}
      <p role="status" className="text-sm text-amber-200 empty:-mt-2">
        {largeScanWarning}
      </p>
      <p className="text-xs text-neutral-400">
        {walking
          ? 'Tap the floor to walk the listener there, or use WASD or the arrow keys. Drag to look around them; scroll or pinch to zoom. You can still drag the speaker and the rug.'
          : 'Drag the speaker (orange), the listener (blue) or the rug. One finger turns the view; two fingers zoom and pan.'}{' '}
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
