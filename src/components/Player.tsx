'use client';

import { useEffect, useRef, useState } from 'react';
import { predictRt60, withoutFixes } from '@/lib/acoustics/simulate';
import { AudioEngine } from '@/lib/audio/engine';
import type { ListenMode } from '@/lib/audio/mix';
import { rateRt60 } from '@/lib/room/rating';
import { validateRoom } from '@/lib/room/roomState';
import { useRoomStore } from '@/lib/room/store';
import { useSimulation } from './useSimulation';

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

export function Player() {
  const room = useRoomStore((s) => s.room);
  const engineRef = useRef<AudioEngine | null>(null);
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [mode, setMode] = useState<ListenMode>({ room: true, fixes: false });
  const [songName, setSongName] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sim = useSimulation(room, sampleRate);

  const valid = validateRoom(room).length === 0;
  const hasFixes = room.fixes.some((f) => f.on);
  const rtNow = valid ? predictRt60(withoutFixes(room)).mid : null;
  const rtFixed = valid && hasFixes ? predictRt60(room).mid : null;

  useEffect(() => () => engineRef.current?.dispose(), []);

  useEffect(() => {
    if (sim.result) engineRef.current?.setIrs(sim.result.now.ir, sim.result.withFixes.ir);
  }, [sim.result]);

  useEffect(() => {
    engineRef.current?.setMode({ room: mode.room, fixes: mode.fixes && hasFixes });
  }, [mode, hasFixes]);

  async function pickSong(file: File) {
    if (!engineRef.current) {
      engineRef.current = new AudioEngine();
      engineRef.current.setMode(mode);
      setSampleRate(engineRef.current.sampleRate);
    }
    setError(null);
    try {
      await engineRef.current.loadSong(file);
      setSongName(file.name);
      setPlaying(false);
    } catch {
      setError("This file type isn't supported on your browser. Try MP3 or M4A.");
    }
  }

  async function togglePlay() {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.playing) {
      engine.pause();
      setPlaying(false);
    } else {
      await engine.play();
      setPlaying(true);
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
      {songName && <p className="truncate text-sm">{songName}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={() => void togglePlay()}
        disabled={!songName || !sim.result}
        className="self-start rounded-lg bg-white px-5 py-2 font-semibold text-neutral-950 disabled:opacity-40"
      >
        {playing ? 'Pause' : 'Play'}
      </button>

      <div className="flex flex-wrap gap-3">
        <Toggle options={['Dry', 'In your room']} value={mode.room} onChange={(v) => setMode((m) => ({ ...m, room: v }))} />
        <Toggle
          options={['Now', 'With fixes']}
          value={mode.fixes}
          onChange={(v) => setMode((m) => ({ ...m, fixes: v }))}
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
        {sim.status === 'error' && <p className="text-red-400">Couldn&apos;t simulate this room. {sim.error}</p>}
      </div>
    </div>
  );
}
