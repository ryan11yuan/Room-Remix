'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { prepareIr } from '@/lib/acoustics/presetIr';
import { AcousticsClient } from '@/lib/acoustics/client';
import type { StereoIr } from '@/lib/acoustics/simulate';
import { DEMO_CLIPS, synthClip, type DemoClipId } from '@/lib/audio/demoClips';
import { AudioEngine } from '@/lib/audio/engine';
import { PRESETS, type Preset } from '@/lib/presets/presets';
import { DEMO_ROOM } from '@/lib/room/demoRoom';
import { encodeRoom } from '@/lib/room/urlCodec';

type SpaceId = Preset['id'] | 'bedroom';

const TABS: { id: SpaceId; label: string }[] = [
  ...PRESETS.map((p) => ({ id: p.id, label: p.label })),
  { id: 'bedroom', label: DEMO_ROOM.name },
];

const LOADING_TEXT: Record<SpaceId, string> = {
  cathedral: 'Loading the cathedral…',
  garage: 'Loading the garage…',
  bedroom: 'Simulating the bedroom…',
};
const AUDIO_ERROR = "Your browser can't play audio here.";
const FETCH_TIMEOUT_MS = 30_000;
const PREFETCH_IDLE_MS = 1500; // when requestIdleCallback is missing, start the first space's download this long after mount
/** A one-sample silent IR for the "with fixes" slot: the engine runs a convolver per slot, and a recorded space has no fixes. */
const silentIr = (sampleRate: number): StereoIr => ({ left: new Float32Array(1), right: new Float32Array(1), sampleRate });
const LOAD_ERROR = "Couldn't load this space. Check your connection and try again.";

type SpaceStatus = 'loading' | 'error';

/** A recording's file, downloaded once and kept until it is decoded. Gives up after 30 s; aborted on unmount. */
function fetchBytes(
  preset: Preset,
  bytes: Map<SpaceId, Promise<ArrayBuffer>>,
  aborters: Set<AbortController>,
): Promise<ArrayBuffer> {
  const kept = bytes.get(preset.id);
  if (kept) return kept;
  const controller = new AbortController();
  aborters.add(controller);
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const job = (async () => {
    const res = await fetch(preset.file, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.arrayBuffer();
  })();
  bytes.set(preset.id, job);
  const done = () => {
    clearTimeout(timer);
    aborters.delete(controller);
  };
  job.then(done, () => {
    done();
    if (bytes.get(preset.id) === job) bytes.delete(preset.id); // so choosing the tab again retries
  });
  return job;
}

function Toggle({ options, value, onChange }: { options: [string, string]; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-neutral-700 p-0.5">
      {options.map((label, i) => {
        const selected = value === (i === 1);
        return (
          <button
            key={label}
            aria-pressed={selected}
            onClick={() => onChange(i === 1)}
            className={`rounded-md px-3 py-1.5 text-sm ${selected ? 'bg-white text-neutral-950' : 'text-neutral-300'}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function CathedralDrawing() {
  return (
    <svg viewBox="0 0 120 80" aria-hidden="true" className="h-24 w-auto text-neutral-400" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 76 V36 Q10 14 35 4 Q60 14 60 36 V76" />
      <path d="M60 76 V36 Q60 14 85 4 Q110 14 110 36 V76" />
      <path d="M22 76 V42 Q22 28 35 20 Q48 28 48 42 V76" />
    </svg>
  );
}

function GarageDrawing() {
  return (
    <svg viewBox="0 0 120 80" aria-hidden="true" className="h-24 w-auto text-neutral-400" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20 H116" />
      <path d="M4 76 H116" />
      <rect x="20" y="20" width="10" height="56" />
      <rect x="62" y="20" width="10" height="56" />
      <path d="M78 76 L116 52" />
    </svg>
  );
}

function BedroomDrawing() {
  const { length, width } = DEMO_ROOM.dims;
  const scale = 40;
  const pad = 8;
  const w = length * scale;
  const h = width * scale;
  return (
    <svg
      viewBox={`0 0 ${w + pad * 2} ${h + pad * 2}`}
      aria-hidden="true"
      className="h-24 w-auto text-neutral-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x={pad} y={pad} width={w} height={h} />
      <circle cx={pad + DEMO_ROOM.speaker.x * scale} cy={pad + DEMO_ROOM.speaker.z * scale} r="5" fill="currentColor" stroke="none" />
      <circle cx={pad + DEMO_ROOM.listener.x * scale} cy={pad + DEMO_ROOM.listener.z * scale} r="5" className="text-white" stroke="currentColor" />
    </svg>
  );
}

export function ListenDemo() {
  const router = useRouter();
  const [tab, setTab] = useState<SpaceId>(TABS[0].id);
  const [clip, setClip] = useState<DemoClipId>(DEMO_CLIPS[0].id);
  const [inSpace, setInSpace] = useState(true);
  const [wantsPlay, setWantsPlay] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false); // no Web Audio here
  const [statuses, setStatuses] = useState<Partial<Record<SpaceId, SpaceStatus>>>({});

  const tabRef = useRef<SpaceId>(tab); // the tab the user last chose, for stale-load checks
  const clipRef = useRef<DemoClipId>(clip);
  const inSpaceRef = useRef(inSpace);
  const wantsPlayRef = useRef(false);
  const engineRef = useRef<AudioEngine | null>(null);
  const clientRef = useRef<AcousticsClient | null>(null);
  const irsRef = useRef<Map<SpaceId, StereoIr>>(new Map());
  const inFlightRef = useRef<Map<SpaceId, Promise<StereoIr>>>(new Map());
  const bytesRef = useRef<Map<SpaceId, Promise<ArrayBuffer>>>(new Map()); // downloaded recordings, not yet decoded
  const abortersRef = useRef<Set<AbortController>>(new Set());
  const silentRef = useRef<StereoIr | null>(null); // made once per engine, so the engine can skip an identical IR

  // Start downloading the first tab's recording once the page is idle, so a quick first tap finds it. Needs no audio context.
  useEffect(() => {
    const first = PRESETS.find((p) => p.id === TABS[0].id);
    if (!first) return;
    const start = () => void fetchBytes(first, bytesRef.current, abortersRef.current).catch(() => {}); // a failure here is retried, and shown, at Play
    if (typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(start, { timeout: PREFETCH_IDLE_MS * 2 });
      return () => cancelIdleCallback(handle);
    }
    const timer = setTimeout(start, PREFETCH_IDLE_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(
    () => () => {
      for (const controller of abortersRef.current) controller.abort(); // an aborted download shows no error
      abortersRef.current.clear();
      bytesRef.current.clear();
      engineRef.current?.dispose();
      engineRef.current = null;
      clientRef.current?.dispose();
      clientRef.current = null;
      irsRef.current.clear();
      silentRef.current = null;
      inFlightRef.current.clear();
    },
    [],
  );

  function setStatus(id: SpaceId, status: SpaceStatus | null) {
    setStatuses((s) => {
      const next = { ...s };
      if (status) next[id] = status;
      else delete next[id];
      return next;
    });
  }

  /** The space's IR: kept once loaded, and one load at a time per space. Rejects if the load fails. */
  function loadSpace(id: SpaceId, engine: AudioEngine): Promise<StereoIr> {
    const cached = irsRef.current.get(id);
    if (cached) return Promise.resolve(cached);
    const running = inFlightRef.current.get(id);
    if (running) return running;
    const job = (async () => {
      let ir: StereoIr;
      if (id === 'bedroom') {
        clientRef.current ??= new AcousticsClient();
        ir = (await clientRef.current.simulate(DEMO_ROOM, engine.sampleRate)).now.ir;
      } else {
        const preset = PRESETS.find((p) => p.id === id)!;
        const bytes = await fetchBytes(preset, bytesRef.current, abortersRef.current);
        bytesRef.current.delete(id); // decoding detaches the buffer, so it can't be decoded twice
        ir = prepareIr(await engine.decodeIr(bytes));
      }
      if (engineRef.current === engine) irsRef.current.set(id, ir);
      return ir;
    })();
    inFlightRef.current.set(id, job);
    const forget = () => {
      if (inFlightRef.current.get(id) === job) inFlightRef.current.delete(id);
    };
    job.then(forget, forget);
    return job;
  }

  /** Make `id` the space being heard, once it is ready; start playing then if the user asked to. */
  async function applySpace(id: SpaceId, engine: AudioEngine) {
    if (!irsRef.current.has(id)) setStatus(id, 'loading');
    let ir: StereoIr;
    try {
      ir = await loadSpace(id, engine);
    } catch {
      if (engineRef.current !== engine) return;
      setStatus(id, 'error');
      if (tabRef.current === id) {
        // Don't leave the previous space playing under this tab's error.
        wantsPlayRef.current = false;
        setWantsPlay(false);
        engine.pause();
      }
      return;
    }
    if (engineRef.current !== engine) return; // unmounted meanwhile
    setStatus(id, null);
    if (tabRef.current !== id) return; // the user chose another tab while this loaded
    engine.setIrs(ir, (silentRef.current ??= silentIr(engine.sampleRate)));
    engine.setMode({ room: inSpaceRef.current, fixes: false });
    if (wantsPlayRef.current && !engine.playing) {
      try {
        await engine.play();
      } catch {
        if (engineRef.current !== engine) return;
        wantsPlayRef.current = false;
        setWantsPlay(false);
        setAudioFailed(true);
      }
    }
  }

  function startEngine(): AudioEngine {
    const engine = new AudioEngine();
    engineRef.current = engine;
    engine.loadClip(synthClip(clipRef.current, engine.sampleRate), engine.sampleRate);
    engine.setMode({ room: inSpaceRef.current, fixes: false });
    // Ask the browser to start the audio context now, inside the tap, in case the space takes a while to load.
    void engine.play().catch(() => {});
    engine.pause();
    return engine;
  }

  function onPlayPause() {
    if (wantsPlayRef.current) {
      wantsPlayRef.current = false;
      setWantsPlay(false);
      engineRef.current?.pause();
      return;
    }
    let engine = engineRef.current;
    if (!engine) {
      try {
        engine = startEngine();
      } catch {
        engineRef.current?.dispose();
        engineRef.current = null;
        setAudioFailed(true);
        return;
      }
    }
    wantsPlayRef.current = true;
    setWantsPlay(true);
    void applySpace(tabRef.current, engine);
  }

  async function exploreIn3d() {
    try {
      router.push('/room#' + (await encodeRoom(DEMO_ROOM)));
    } catch {
      router.push('/room');
    }
  }

  function chooseTab(id: SpaceId) {
    tabRef.current = id;
    setTab(id);
    const engine = engineRef.current;
    if (engine) void applySpace(id, engine); // also retries a space that failed
  }

  function chooseClip(id: DemoClipId) {
    clipRef.current = id;
    setClip(id);
    const engine = engineRef.current;
    if (!engine) return;
    engine.loadClip(synthClip(id, engine.sampleRate), engine.sampleRate); // stops, and rewinds to the start
    // Not playing yet: the space is still loading, and starts the clip when it is ready.
    if (wantsPlayRef.current && irsRef.current.has(tabRef.current)) void engine.play().catch(() => {});
  }

  function chooseMode(room: boolean) {
    inSpaceRef.current = room;
    setInSpace(room);
    engineRef.current?.setMode({ room, fixes: false });
  }

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (index + step + TABS.length) % TABS.length;
    if (!step && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    chooseTab(TABS[to].id);
    document.getElementById(`listen-tab-${TABS[to].id}`)?.focus();
  }

  const preset = PRESETS.find((p) => p.id === tab);
  const status = statuses[tab];
  const statusText = audioFailed
    ? AUDIO_ERROR
    : status === 'error'
      ? LOAD_ERROR
      : status === 'loading'
        ? LOADING_TEXT[tab]
        : '';
  const { length, width, height } = DEMO_ROOM.dims;

  return (
    <section aria-label="Listen to a space" className="flex flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <div role="tablist" aria-label="Spaces" className="flex flex-wrap gap-1">
        {TABS.map((t, i) => {
          const selected = t.id === tab;
          return (
            <button
              key={t.id}
              id={`listen-tab-${t.id}`}
              role="tab"
              aria-selected={selected}
              aria-controls="listen-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => chooseTab(t.id)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className={`rounded-md px-3 py-1.5 text-sm ${selected ? 'bg-white font-semibold text-neutral-950' : 'text-neutral-300'}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div id="listen-panel" role="tabpanel" tabIndex={0} aria-labelledby={`listen-tab-${tab}`} className="flex items-center gap-4">
        {tab === 'cathedral' && <CathedralDrawing />}
        {tab === 'garage' && <GarageDrawing />}
        {tab === 'bedroom' && <BedroomDrawing />}
        {preset ? (
          <div className="flex min-w-0 flex-col gap-1 text-sm">
            <p className="font-semibold">{preset.place}</p>
            <p className="text-neutral-300">{preset.blurb}</p>
            <p className="text-neutral-500">Recorded in a real space</p>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col items-start gap-2 text-sm">
            <p className="text-neutral-300">
              A simulated bedroom, {length} × {width} × {height} m, carpeted and furnished.
            </p>
            <button
              onClick={() => void exploreIn3d()}
              className="rounded-md border border-neutral-700 px-3 py-1.5"
            >
              Explore it in 3D
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-400">Play:</span>
        {DEMO_CLIPS.map((c) => (
          <button
            key={c.id}
            aria-pressed={c.id === clip}
            onClick={() => chooseClip(c.id)}
            className={`rounded-md border px-2 py-1 ${c.id === clip ? 'border-white bg-white text-neutral-950' : 'border-neutral-700'}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onPlayPause} className="rounded-lg bg-white px-5 py-2 font-semibold text-neutral-950">
          {wantsPlay ? 'Pause' : 'Play'}
        </button>
        <Toggle options={['Dry', 'In the space']} value={inSpace} onChange={chooseMode} />
      </div>

      <p className="text-sm text-neutral-400">🎧 Use headphones. Room differences are hard to hear on phone speakers.</p>
      <p role="status" className={`min-h-5 text-sm ${audioFailed || status === 'error' ? 'text-red-400' : 'text-neutral-400'}`}>
        {statusText}
      </p>
    </section>
  );
}
