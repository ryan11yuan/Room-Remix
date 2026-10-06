'use client';

import { useEffect, useRef, useState } from 'react';
import type { StereoIr } from '@/lib/acoustics/simulate';
import { DEMO_CLIPS, synthClip, type DemoClipId } from '@/lib/audio/demoClips';
import { AudioEngine } from '@/lib/audio/engine';
import { silentIr, type ListenMode } from '@/lib/audio/mix';
import { roomCardFor } from '@/lib/room/roomCard';
import { useRoomStore } from '@/lib/room/store';
import { Toggle } from './Toggle';
import { resultMatchesRate, type Simulation } from './useSimulation';

type PlayerProps = {
  sim: Simulation;
  mode: ListenMode;
  onModeChange: (mode: ListenMode) => void;
  onSampleRate: (rate: number) => void;
};

/**
 * Plays a song through the room, with one engine for two sections: the song picker, which sits in the page under the
 * 3D view, and the control bar, which is fixed to the bottom of the screen on phones and sits in the side column on
 * wide screens.
 */
export function Player({ sim, mode, onModeChange, onSampleRate }: PlayerProps) {
  const room = useRoomStore((s) => s.room);
  const engineRef = useRef<AudioEngine | null>(null);
  const silentRef = useRef<StereoIr | null>(null); // the "with fixes" IR while no fix is on: one per engine
  const [engineRate, setEngineRate] = useState<number | null>(null);
  const [songName, setSongName] = useState<string | null>(null);
  const [clipId, setClipId] = useState<DemoClipId | null>(null); // the built-in clip that is loaded, if any
  const pickRef = useRef(0); // counts picks, so the last one wins; read only in handlers
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = resultMatchesRate(sim.result, engineRate);
  const hasFixes = room.fixes.some((f) => f.on);
  const card = roomCardFor(room);
  const summary = !songName
    ? 'Pick a song or a built-in clip to play.'
    : !card
      ? 'Fix the room under Edit room to hear it.'
      : !ready
        ? 'Simulating your room…'
        : card.summary;

  useEffect(() => () => engineRef.current?.dispose(), []);

  // With no fix on, "with fixes" is the same room, and the mode never routes to it: a silent one-sample IR keeps that
  // slot's convolver from running a full room IR for nothing.
  useEffect(() => {
    const engine = engineRef.current;
    const result = sim.result;
    if (!engine || !resultMatchesRate(result, engineRate)) return;
    engine.setIrs(result.now.ir, hasFixes ? result.withFixes.ir : (silentRef.current ??= silentIr(engine.sampleRate)));
  }, [sim.result, engineRate, hasFixes]);

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
    <>
      <section aria-labelledby="listen-heading" className="flex flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 id="listen-heading" className="text-lg font-semibold">
          Listen
        </h2>
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
            className="text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-neutral-700 file:bg-transparent file:px-3 file:text-neutral-100"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-neutral-400">Or try a built-in clip:</span>
          {DEMO_CLIPS.map((clip) => (
            <button
              key={clip.id}
              aria-pressed={clipId === clip.id}
              onClick={() => pickClip(clip.id, clip.label)}
              className={`min-h-11 rounded-md border px-3 ${clipId === clip.id ? 'border-white bg-white text-neutral-950' : 'border-neutral-700'}`}
            >
              {clip.label}
            </button>
          ))}
        </div>
        {songName && <p className="truncate text-sm">{songName}</p>}
        <p role="alert" className="text-sm text-red-400 empty:sr-only">
          {error}
        </p>
      </section>

      <section
        aria-label="Player controls"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-800 bg-neutral-950/95 px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur lg:static lg:z-auto lg:rounded-xl lg:border lg:bg-neutral-900/50 lg:p-4 lg:backdrop-blur-none"
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          <button
            onClick={() => void togglePlay()}
            disabled={!songName || !ready}
            className="min-h-11 rounded-lg bg-white px-5 font-semibold text-neutral-950 disabled:opacity-40"
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <Toggle
            label="Listen dry or in your room"
            options={['Dry', 'In your room']}
            value={mode.room}
            onChange={(inRoom) => onModeChange({ ...mode, room: inRoom })}
          />
          <Toggle
            label="Compare now and with fixes"
            options={['Now', 'With fixes']}
            value={mode.fixes}
            onChange={(fixes) => onModeChange({ ...mode, fixes })}
            disabled={!mode.room || !hasFixes}
          />
          <p className="min-w-0 flex-1 basis-40 truncate text-xs text-neutral-400">{summary}</p>
          {/* Mounted all the time, so a screen reader announces the error when it appears. */}
          <div role="status" className="w-full empty:sr-only">
            {sim.status === 'error' && (
              <p className="flex flex-wrap items-center gap-2 text-sm text-red-400">
                Couldn&apos;t simulate this room. {sim.error}
                <button onClick={sim.retry} className="min-h-11 px-2 underline">
                  Retry
                </button>
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
