'use client';

import { useSyncExternalStore } from 'react';
import { OBJECT_INFO } from '@/lib/acoustics/objects';
import { DEMO_CLIPS } from '@/lib/audio/demoClips';
import type { RoomObject } from '@/lib/room/types';
import type { SoundController } from '@/lib/viewer/SoundController';

/** "Chair ×5, Table ×2" for the objects that absorb (or reflect). */
function summary(objects: RoomObject[], absorbs: boolean): string {
  const counts = new Map<string, number>();
  for (const o of objects) if (OBJECT_INFO[o.label].absorbs === absorbs) counts.set(OBJECT_INFO[o.label].name, (counts.get(OBJECT_INFO[o.label].name) ?? 0) + 1);
  return [...counts].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join(', ') || 'Nothing found';
}

/** The sound panel, top right of the viewer (spec 2026-10-07 sound §8). */
export function SoundPanel({ controller }: { controller: SoundController }) {
  const s = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const map = typeof s.spots === 'object' ? s.spots : null;
  const scoreLine = [
    s.speakerScore !== null && `This spot: ${Math.round(s.speakerScore)}/100`,
    map?.best && `Best: ${Math.round(map.best.score)}/100`,
  ].filter(Boolean).join(' · ');

  return (
    <aside className="absolute right-0 top-0 m-4 flex max-h-[calc(100%-2rem)] w-[300px] max-w-[calc(100%-2rem)] flex-col gap-4 overflow-y-auto rounded-card border border-cork bg-walnut/80 p-5 sm:m-6">
      <section className="flex flex-col gap-1.5">
        <h2 className="text-heading-sm">Sound</h2>
        <p className="text-label text-cream/70">
          About {s.dims.length.toFixed(1)} × {s.dims.width.toFixed(1)} × {s.dims.height.toFixed(1)} m
        </p>
        <p className="text-label text-cream/70">Echo time {s.rt60.toFixed(2)} s</p>
      </section>

      <section className="rule flex flex-col gap-3 pt-4">
        <span className="text-label">Speaker</span>
        <button className={s.speaker ? 'ghost' : 'pill'} onClick={() => controller.placeSpeaker()} disabled={s.placing}>
          {s.placing ? 'Click the floor' : s.speaker ? 'Move speaker' : 'Place speaker'}
        </button>
        <button className="ghost" onClick={() => controller.findBestSpot()} disabled={s.spots === 'finding'}>
          {s.spots === 'finding' ? 'Finding the best spot' : 'Find the best spot'}
        </button>
        {map?.best && (
          <button className="ghost" onClick={() => controller.moveSpeakerToBest()}>
            Move speaker here
          </button>
        )}
        {s.spots === 'failed' && <p className="voice text-label text-cream/70">Couldn&apos;t score the room. Try again.</p>}
        {scoreLine && <p className="text-label text-cream/70">{scoreLine}</p>}
      </section>

      <section className="rule flex flex-col gap-3 pt-4">
        <span className="text-label">Listen</span>
        <button className={s.speaker ? 'pill' : 'ghost'} onClick={() => controller.togglePlay()} disabled={!s.speaker}>
          {s.playing ? 'Pause' : 'Play'}
        </button>
        {!s.speaker && <p className="voice text-label text-cream/70">Place the speaker first.</p>}
        <div className="flex gap-2" role="group" aria-label="Music">
          {DEMO_CLIPS.map((clip) => (
            <button
              key={clip.id}
              className={`ghost flex-1 ${s.clip === clip.id ? 'bg-cream text-walnut' : ''}`}
              aria-pressed={s.clip === clip.id}
              onClick={() => controller.setClip(clip.id)}
            >
              {clip.label}
            </button>
          ))}
        </div>
        <p className="voice text-label text-cream/70">Use headphones. Walk with W A S D.</p>
      </section>

      <section className="rule flex flex-col gap-2 pt-4">
        <span className="text-label">Objects</span>
        {s.objects === 'finding' && <p className="voice text-label text-cream/70">Finding objects… (about a minute the first time)</p>}
        {s.objects === 'failed' && <p className="voice text-label text-cream/70">Couldn&apos;t find objects. Sound still works without them.</p>}
        {Array.isArray(s.objects) && (
          <>
            <p className="text-label">
              <span className="text-[#5fd4c4]">Absorbs sound</span>
              <span className="voice block text-cream/70">{summary(s.objects, true)}</span>
            </p>
            <p className="text-label">
              <span className="text-[#f0a540]">Reflects sound</span>
              <span className="voice block text-cream/70">{summary(s.objects, false)}</span>
            </p>
          </>
        )}
      </section>
    </aside>
  );
}
