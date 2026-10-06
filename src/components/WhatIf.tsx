'use client';

import { LIMITS, RUG_SIZES } from '@/lib/room/constants';
import { SURFACE_LABELS } from '@/lib/room/labels';
import { findFreePanelSpot } from '@/lib/room/placement';
import { validateRoom } from '@/lib/room/roomState';
import { useRoomStore } from '@/lib/room/store';
import { WALL_IDS, type Fix, type RugSize, type WallId } from '@/lib/room/types';
import { formatLength, type Unit } from '@/lib/room/units';
import { ErrorList } from './ErrorList';
import { inputClass, LengthField } from './LengthField';
import { useUnits } from './useUnits';

const RUG_NAMES: Record<RugSize, string> = { S: 'Small', M: 'Medium', L: 'Large' };
/** "Medium 1.6 × 2.3 m": width × length, in the visitor's unit. */
const rugLabel = (size: RugSize, unit: Unit) =>
  `${RUG_NAMES[size]} ${formatLength(RUG_SIZES[size].z, unit)} × ${formatLength(RUG_SIZES[size].x, unit)} ${unit}`;
const addButton = 'min-h-11 rounded-md border border-neutral-700 px-3 text-sm disabled:opacity-40';

/** "What if…": add a rug or panels, switch each on or off, and place them. Next to Now ↔ With fixes in the player column. */
export function WhatIf() {
  const room = useRoomStore((s) => s.room);
  const update = useRoomStore((s) => s.update);
  const [unit] = useUnits();
  const rugCount = room.fixes.filter((f) => f.kind === 'rug').length;
  const panelCount = room.fixes.length - rugCount;
  const errors = validateRoom(room);
  const invalid = (index: number) => errors.some((e) => e.field === `fixes.${index}`);

  const setFix = (index: number, patch: Partial<Fix>) =>
    update((r) => ({ ...r, fixes: r.fixes.map((f, i) => (i === index ? ({ ...f, ...patch } as Fix) : f)) }));
  const removeFix = (index: number) => update((r) => ({ ...r, fixes: r.fixes.filter((_, i) => i !== index) }));
  const addRug = () =>
    update((r) => ({
      ...r,
      fixes: [...r.fixes, { kind: 'rug', size: 'M', x: r.dims.length / 2, z: r.dims.width / 2, on: true }],
    }));
  const addPanel = () =>
    update((r) => {
      const spot = findFreePanelSpot(r);
      return spot ? { ...r, fixes: [...r.fixes, spot] } : r;
    });

  return (
    <section aria-labelledby="what-if-heading" className="flex flex-col gap-3">
      <h2 id="what-if-heading" className="text-lg font-semibold">
        What if…
      </h2>
      <p className="text-sm text-neutral-400">Add a rug or panels, then switch between Now and With fixes to hear the difference.</p>
      <div className="flex gap-3">
        <button onClick={addRug} disabled={rugCount >= LIMITS.maxRugs} className={addButton}>
          + Rug
        </button>
        <button onClick={addPanel} disabled={panelCount >= LIMITS.maxPanels || findFreePanelSpot(room) === null} className={addButton}>
          + Panel
        </button>
      </div>
      {room.fixes.map((fix, i) => {
        const rowLabel =
          fix.kind === 'rug' ? 'Rug' : `Panel ${room.fixes.slice(0, i + 1).filter((f) => f.kind === 'panel').length}`;
        return (
          <div key={i} className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 p-3">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={fix.on} onChange={(e) => setFix(i, { on: e.target.checked })} />
              {rowLabel}
            </label>
            {fix.kind === 'rug' ? (
              <>
                <select
                  aria-label="Rug size"
                  value={fix.size}
                  onChange={(e) => setFix(i, { size: e.target.value as RugSize })}
                  className={inputClass}
                >
                  {(['S', 'M', 'L'] as const).map((s) => (
                    <option key={s} value={s}>
                      {rugLabel(s, unit)}
                    </option>
                  ))}
                </select>
                <LengthField label={`${rowLabel} centre x`} metres={fix.x} unit={unit} onChange={(v) => setFix(i, { x: v })} invalid={invalid(i)} />
                <LengthField label={`${rowLabel} centre z`} metres={fix.z} unit={unit} onChange={(v) => setFix(i, { z: v })} invalid={invalid(i)} />
              </>
            ) : (
              <>
                <select
                  aria-label={`${rowLabel} wall`}
                  value={fix.wall}
                  onChange={(e) => setFix(i, { wall: e.target.value as WallId })}
                  className={inputClass}
                >
                  {WALL_IDS.map((w) => (
                    <option key={w} value={w}>
                      {SURFACE_LABELS[w]}
                    </option>
                  ))}
                </select>
                <LengthField label={`${rowLabel} along wall`} metres={fix.u} unit={unit} onChange={(v) => setFix(i, { u: v })} invalid={invalid(i)} />
                <LengthField label={`${rowLabel} height`} metres={fix.v} unit={unit} onChange={(v) => setFix(i, { v })} invalid={invalid(i)} />
              </>
            )}
            <button onClick={() => removeFix(i)} aria-label={`Remove ${rowLabel.toLowerCase()}`} className="min-h-11 px-2 text-sm text-red-400">
              Remove
            </button>
          </div>
        );
      })}
      <ErrorList errors={errors} place="whatIf" unit={unit} />
    </section>
  );
}
