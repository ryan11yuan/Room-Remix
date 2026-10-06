'use client';

import { useEffect, useRef, useState } from 'react';
import { predictRt60, withoutFixes } from '@/lib/acoustics/simulate';
import { DEMO_CLIPS, synthClip, type DemoClipId } from '@/lib/audio/demoClips';
import { AudioEngine } from '@/lib/audio/engine';
import type { ListenMode } from '@/lib/audio/mix';
import { rateRt60 } from '@/lib/room/rating';
import { validateRoom } from '@/lib/room/roomState';
import { useRoomStore } from '@/lib/room/store';
import { resultMatchesRate, type Simulation } from './useSimulation';

function Toggle({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: [string, string];
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`inline-flex rounded-lg border border-neutral-700 p-0.5 ${disabled ? 'opacity-40' : ''}`}>
      {options.map((label, i) => {
        const selected = value === (i === 1);
        return (
          <button
            key={label}
            disabled={disabled}
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

type PlayerProps = {
  sim: Simulation;
  mode: ListenMode;
  onModeChange: (mode: ListenMode) => void;
  onSampleRate: (rate: number) => void;
};

export function Player({ sim, mode, onModeChange, onSampleRate }: PlayerProps) {
  const room = useRoomStore((s) => s.room);
  const engineRef = useRef<AudioEngine | null>(null);
  const [engineRate, setEngineRate] = useState<number | null>(null);
  const [songName, setSongName] = useState<string | null>(null);
  const [clipId, setClipId] = useState<DemoClipId | null>(null); // the built-in clip that is loaded, if any
  const pickRef = useRef(0); // counts picks, so the last one wins; read only in handlers
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = resultMatchesRate(sim.result, engineRate);

  const valid = validateRoom(room).length === 0;
  const hasFixes = room.fixes.some((f) => f.on);
  const rtNow = valid ? predictRt60(withoutFixes(room)).mid : null;
  const rtFixed = valid && hasFixes ? predictRt60(room).mid : null;

  useEffect(() => () => engineRef.current?.dispose(), []);

  useEffect(() => {
    const result = sim.result;
    if (resultMatchesRate(result, engineRate)) engineRef.current?.setIrs(result.now.ir, result.withFixes.ir);
  }, [sim.result, engineRate]);

  useEffect(() => {
    engineRef.current?.setMode({ room: mode.room, fixes: mode.fixes && hasFixes });
  }, [mode, hasFixes]);

  /** The engine starts at the first tap (browsers only allow sound after one). */
  function ensureEngine(): AudioEngine {
    if (!engineRef.current) {
      const engine = new AudioEngine();
      engineRef.current = engine;
      engine.setMode({ room: mode.room, fixes: mode.fixes && hasFixes });
      setEngineRate(engine.sampleRate);
      onSampleRate(engine.sampleRate); // the page re-simulates if this isn't the default rate
    }
    return engineRef.current;
  }

  async function pickSong(file: File) {
    const engine = ensureEngine();
    const pick = ++pickRef.current;
    setError(null);
    try {
      await engine.loadSong(file);
      if (pick !== pickRef.current) return; // a later pick (a clip, say) has replaced this song
      setSongName(file.name);
      setClipId(null);
      setPlaying(false);
    } catch {
      if (pick !== pickRef.current) return;
      setError("This file type isn't supported on your browser. Try MP3 or M4A.");
    }
  }

  function pickClip(id: DemoClipId, label: string) {
    const engine = ensureEngine();
    pickRef.current++;
    setError(null);
    engine.loadClip(synthClip(id, engine.sampleRate), engine.sampleRate);
    setSongName(label);
    setClipId(id);
    setPlaying(false);
  }

  async function togglePlay() {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.playing) {
      engine.pause();
      setPlaying(false);
    } else {
      try {
        await engine.play();
      } catch {
        setError("Couldn't start playback. Try picking the song again.");
      }
      setPlaying(engine.playing);
    }
  }

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <p className="text-sm text-neutral-400">🎧 Use headphones. Room differences are hard to hear on phone speakers.</p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-400">Song (stays on your device)</span>
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void pickSong(file);
          }}
          className="text-sm"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-400">Or try a built-in clip:</span>
        {DEMO_CLIPS.map((clip) => (
          <button key={clip.id} aria-pressed={clipId === clip.id} onClick={() => pickClip(clip.id, clip.label)} className="rounded-md border border-neutral-700 px-2 py-1">
            {clip.label}
          </button>
        ))}
      </div>
      {songName && <p className="truncate text-sm">{songName}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={() => void togglePlay()}
        disabled={!songName || !ready}
        className="self-start rounded-lg bg-white px-5 py-2 font-semibold text-neutral-950 disabled:opacity-40"
      >
        {playing ? 'Pause' : 'Play'}
      </button>

      <div className="flex flex-wrap gap-3">
        <Toggle options={['Dry', 'In your room']} value={mode.room} onChange={(v) => onModeChange({ ...mode, room: v })} />
        <Toggle
          options={['Now', 'With fixes']}
          value={mode.fixes}
          onChange={(v) => onModeChange({ ...mode, fixes: v })}
          disabled={!mode.room || !hasFixes}
        />
      </div>

      <div className="flex flex-col gap-1 text-sm">
        {rtNow !== null && (
          <p>
            Now: <strong>{rtNow.toFixed(2)} s</strong> · {rateRt60(rtNow)}
          </p>
        )}
        {rtFixed !== null && (
          <p>
            With fixes: <strong>{rtFixed.toFixed(2)} s</strong> · {rateRt60(rtFixed)}
          </p>
        )}
        {rtNow !== null && rtFixed === null && <p className="text-neutral-500">Add a rug or panel to compare.</p>}
        {sim.status === 'running' && <p className="text-neutral-500">Simulating…</p>}
        {sim.status === 'error' && (
          <p className="text-red-400">
            Couldn&apos;t simulate this room. {sim.error}{' '}
            <button onClick={sim.retry} className="underline">
              Retry
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
