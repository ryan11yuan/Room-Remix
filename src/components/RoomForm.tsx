'use client';

import { MATERIALS } from '@/lib/acoustics/materials';
import { LIMITS, RUG_SIZES } from '@/lib/room/constants';
import { FURNISHING_LABELS, SURFACE_LABELS } from '@/lib/room/labels';
import { findFreePanelSpot } from '@/lib/room/placement';
import { validateRoom } from '@/lib/room/roomState';
import { useRoomStore } from '@/lib/room/store';
import {
  MATERIAL_IDS,
  SURFACE_IDS,
  WALL_IDS,
  type Fix,
  type Furnishing,
  type MaterialId,
  type RoomState,
  type RugSize,
  type WallId,
} from '@/lib/room/types';
import { errorMessage, formatLength, type Unit } from '@/lib/room/units';
import { inputClass, LengthField } from './LengthField';
import { Toggle } from './Toggle';
import { useUnits } from './useUnits';

const RUG_NAMES: Record<RugSize, string> = { S: 'Small', M: 'Medium', L: 'Large' };
/** "Medium 1.6 × 2.3 m": width × length, in the visitor's unit. */
const rugLabel = (size: RugSize, unit: Unit) =>
  `${RUG_NAMES[size]} ${formatLength(RUG_SIZES[size].z, unit)} × ${formatLength(RUG_SIZES[size].x, unit)} ${unit}`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">{title}</h2>
      {children}
    </section>
  );
}

export function RoomForm() {
  const room = useRoomStore((s) => s.room);
  const update = useRoomStore((s) => s.update);
  const [unit, setUnit] = useUnits();
  const errors = validateRoom(room);
  const rugCount = room.fixes.filter((f) => f.kind === 'rug').length;
  const panelCount = room.fixes.length - rugCount;

  const setDim = (key: keyof RoomState['dims'], value: number) =>
    update((r) => ({ ...r, dims: { ...r.dims, [key]: value } }));
  const setSpeaker = (axis: 'x' | 'y' | 'z', value: number) =>
    update((r) => ({ ...r, speaker: { ...r.speaker, [axis]: value } }));
  const setListener = (axis: 'x' | 'y' | 'z', value: number) =>
    update((r) => ({ ...r, listener: { ...r.listener, [axis]: value } }));
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
    <div className="flex flex-col gap-8">
      <Section title="Room size">
        <Toggle label="Units" options={['Metres', 'Feet']} value={unit === 'ft'} onChange={(feet) => setUnit(feet ? 'ft' : 'm')} />
        <div className="flex flex-wrap gap-3">
          <LengthField label="Length" metres={room.dims.length} unit={unit} onChange={(v) => setDim('length', v)} />
          <LengthField label="Width" metres={room.dims.width} unit={unit} onChange={(v) => setDim('width', v)} />
          <LengthField label="Ceiling height" metres={room.dims.height} unit={unit} onChange={(v) => setDim('height', v)} />
        </div>
      </Section>

      <Section title="Surfaces">
        <div className="grid grid-cols-2 gap-3">
          {SURFACE_IDS.map((surface) => (
            <label key={surface} className="flex flex-col gap-1 text-sm">
              <span className="text-neutral-400">{SURFACE_LABELS[surface]}</span>
              <select
                value={room.surfaces[surface]}
                onChange={(e) =>
                  update((r) => ({ ...r, surfaces: { ...r.surfaces, [surface]: e.target.value as MaterialId } }))
                }
                className={inputClass}
              >
                {MATERIAL_IDS.map((m) => (
                  <option key={m} value={m}>
                    {MATERIALS[m].label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-400">Furniture</span>
          <select
            value={room.furnishing}
            onChange={(e) => update((r) => ({ ...r, furnishing: e.target.value as Furnishing }))}
            className={inputClass}
          >
            {(Object.keys(FURNISHING_LABELS) as Furnishing[]).map((f) => (
              <option key={f} value={f}>
                {FURNISHING_LABELS[f]}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section title="Speaker and listener">
        <p className="text-xs text-neutral-500">
          x runs from the front wall toward the back, z from the right wall toward the left (as you face the front wall), y is height.
        </p>
        <div className="flex flex-wrap gap-3">
          <LengthField label="Speaker x" metres={room.speaker.x} unit={unit} onChange={(v) => setSpeaker('x', v)} />
          <LengthField label="Speaker y" metres={room.speaker.y} unit={unit} onChange={(v) => setSpeaker('y', v)} />
          <LengthField label="Speaker z" metres={room.speaker.z} unit={unit} onChange={(v) => setSpeaker('z', v)} />
        </div>
        <div className="flex flex-wrap gap-3">
          <LengthField label="Listener x" metres={room.listener.x} unit={unit} onChange={(v) => setListener('x', v)} />
          <LengthField label="Listener y" metres={room.listener.y} unit={unit} onChange={(v) => setListener('y', v)} />
          <LengthField label="Listener z" metres={room.listener.z} unit={unit} onChange={(v) => setListener('z', v)} />
        </div>
      </Section>

      <Section title="What if…">
        <div className="flex gap-3">
          <button
            onClick={addRug}
            disabled={rugCount >= LIMITS.maxRugs}
            className="min-h-11 rounded-md border border-neutral-700 px-3 text-sm disabled:opacity-40"
          >
            + Rug
          </button>
          <button
            onClick={addPanel}
            disabled={panelCount >= LIMITS.maxPanels || findFreePanelSpot(room) === null}
            className="min-h-11 rounded-md border border-neutral-700 px-3 text-sm disabled:opacity-40"
          >
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
                  <LengthField label={`${rowLabel} centre x`} metres={fix.x} unit={unit} onChange={(v) => setFix(i, { x: v })} />
                  <LengthField label={`${rowLabel} centre z`} metres={fix.z} unit={unit} onChange={(v) => setFix(i, { z: v })} />
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
                  <LengthField label={`${rowLabel} along wall`} metres={fix.u} unit={unit} onChange={(v) => setFix(i, { u: v })} />
                  <LengthField label={`${rowLabel} height`} metres={fix.v} unit={unit} onChange={(v) => setFix(i, { v })} />
                </>
              )}
              <button
                onClick={() => removeFix(i)}
                aria-label={`Remove ${rowLabel.toLowerCase()}`}
                className="min-h-11 px-2 text-sm text-red-400"
              >
                Remove
              </button>
            </div>
          );
        })}
      </Section>

      {errors.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
          {errors.map((e) => (
            <li key={`${e.field}:${e.message}`}>{errorMessage(e, unit)}</li>
          ))}
          <li className="font-medium">Changes to this room aren&apos;t saved until this is fixed.</li>
        </ul>
      )}
    </div>
  );
}
