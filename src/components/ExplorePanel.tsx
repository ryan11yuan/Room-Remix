'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { nameInfo, NAMES, type NameId } from '@/lib/explore/names';
import type { RoomObject } from '@/lib/room/types';
import type { ExploreController } from '@/lib/viewer/ExploreController';

const KEYS_LINE = 'W S walk · A D turn · Space scan · Tab choose · Enter go · Esc stop · H help';
const PANEL = 'absolute right-0 top-0 m-4 flex max-h-[calc(100%-2rem)] w-[300px] max-w-[calc(100%-2rem)] flex-col gap-4 overflow-y-auto rounded-card border border-cork bg-walnut/80 p-5 sm:m-6';

/** "Chair 1", "Chair 2": each object's number among those with its name. */
function numbering(objects: RoomObject[]): number[] {
  const seen = new Map<string, number>();
  return objects.map((o) => {
    const n = (seen.get(o.label) ?? 0) + 1;
    seen.set(o.label, n);
    return n;
  });
}

/** The panel top right of the viewer, and the captions while exploring (spec 2026-10-08 §9). */
export function ExplorePanel({ controller }: { controller: ExploreController }) {
  const s = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const selects = useRef<(HTMLSelectElement | null)[]>([]);
  useEffect(() => {
    if (s.focus !== null) selects.current[s.focus]?.focus();
  }, [s.focus, s.objects]);

  if (s.mode === 'exploring') {
    return (
      <>
        <aside className={PANEL}>
          <h2 className="text-heading-sm">Exploring</h2>
          <p className="text-label text-cream/70">{KEYS_LINE}</p>
          <button className="ghost" onClick={() => controller.stopExploring()}>
            Stop exploring
          </button>
        </aside>
        <p aria-live="polite" className="voice pointer-events-none absolute inset-x-0 bottom-0 mx-auto max-w-3xl p-6 text-center text-body">
          {s.caption}
        </p>
      </>
    );
  }

  const objects = Array.isArray(s.objects) ? s.objects : [];
  const numbers = numbering(objects);
  return (
    <aside className={PANEL}>
      <section className="flex flex-col gap-1.5">
        <h2 className="text-heading-sm">Room</h2>
        <p className="text-label text-cream/70">
          About {s.dims.length.toFixed(1)} × {s.dims.width.toFixed(1)} × {s.dims.height.toFixed(1)} m
        </p>
      </section>

      <section className="rule flex flex-col gap-3 pt-4">
        <span className="text-label">Objects</span>
        {s.objects === 'finding' && <p className="voice text-label text-cream/70">Finding objects… (about 20 seconds the first time)</p>}
        {s.findFailed && <p className="voice text-label text-cream/70">Couldn&apos;t find objects. Add them by hand.</p>}
        <ul className="flex flex-col gap-2">
          {objects.map((o, i) => {
            const name = `${nameInfo(o.label).title} ${numbers[i]}`;
            return (
              <li
                key={`${i}-${o.label}`}
                className="flex items-center gap-2"
                onMouseEnter={() => controller.setHighlight(i)}
                onMouseLeave={() => controller.setHighlight(null)}
                onFocus={() => controller.setHighlight(i)}
                onBlur={() => controller.setHighlight(null)}
              >
                <span className="w-6 text-label text-cream/70">{numbers[i]}</span>
                <select
                  ref={(el) => {
                    selects.current[i] = el;
                  }}
                  aria-label={`Name of ${name}`}
                  value={o.label}
                  onChange={(e) => controller.rename(i, e.target.value as NameId)}
                  className="min-h-11 min-w-0 flex-1 rounded-card border border-cork bg-walnut px-3 text-label"
                >
                  {NAMES.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
                </select>
                <button className="ghost" onClick={() => controller.remove(i)} aria-label={`Remove ${name}`}>
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
        <button className="ghost" onClick={() => controller.add()} disabled={s.adding || s.objects === 'finding'}>
          Add an object
        </button>
        {s.adding && <p className="voice text-label text-cream/70">Click the floor where it is.</p>}
        {s.saveFailed && <p className="voice text-label text-cream/70">Couldn&apos;t save your changes.</p>}
      </section>

      <section className="rule flex flex-col gap-3 pt-4">
        <button className="pill" onClick={() => void controller.startExploring()} disabled={s.objects === 'finding' || s.mode === 'starting'}>
          Start exploring
        </button>
        {s.voicesFailed && <p className="voice text-label text-cream/70">Couldn&apos;t load the voices.</p>}
        <p className="voice text-label text-cream/70">Use headphones.</p>
      </section>
    </aside>
  );
}
