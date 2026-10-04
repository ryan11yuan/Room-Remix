'use client';

import { MATERIALS } from '@/lib/acoustics/materials';
import { LIMITS } from '@/lib/room/constants';
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
  type SurfaceId,
  type WallId,
} from '@/lib/room/types';

const SURFACE_LABELS: Record<SurfaceId, string> = {
  floor: 'Floor',
  ceiling: 'Ceiling',
  wallX0: 'Front wall',
  wallX1: 'Back wall',
  wallZ0: 'Left wall',
  wallZ1: 'Right wall',
};

const FURNISHING_LABELS: Record<Furnishing, string> = {
  bare: 'Bare (empty room)',
  some: 'Some (bed or sofa)',
  full: 'Full (bed, sofa, shelves, curtains)',
};

const RUG_LABELS: Record<RugSize, string> = { S: 'Small 1.2 × 1.8 m', M: 'Medium 1.6 × 2.3 m', L: 'Large 2 × 3 m' };

const inputClass = 'rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5';

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-neutral-400">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={0.1}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className={`${inputClass} w-24`}
      />
    </label>
  );
}

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
    update((r) => ({
      ...r,
      fixes: [...r.fixes, { kind: 'panel', wall: 'wallZ1', u: r.dims.length / 2, v: 1.2, on: true }],
    }));

  return (
    <div className="flex flex-col gap-8">
      <Section title="Room size (metres)">
        <div className="flex flex-wrap gap-3">
          <NumberField label="Length" value={room.dims.length} onChange={(v) => setDim('length', v)} />
          <NumberField label="Width" value={room.dims.width} onChange={(v) => setDim('width', v)} />
          <NumberField label="Ceiling height" value={room.dims.height} onChange={(v) => setDim('height', v)} />
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

      <Section title="Speaker and listener (metres)">
        <p className="text-xs text-neutral-500">
          x runs along the length from the front wall, z across the width from the left wall, y is height.
        </p>
        <div className="flex flex-wrap gap-3">
          <NumberField label="Speaker x" value={room.speaker.x} onChange={(v) => setSpeaker('x', v)} />
          <NumberField label="Speaker y" value={room.speaker.y} onChange={(v) => setSpeaker('y', v)} />
          <NumberField label="Speaker z" value={room.speaker.z} onChange={(v) => setSpeaker('z', v)} />
        </div>
        <div className="flex flex-wrap gap-3">
          <NumberField label="Listener x" value={room.listener.x} onChange={(v) => setListener('x', v)} />
          <NumberField label="Listener y" value={room.listener.y} onChange={(v) => setListener('y', v)} />
          <NumberField label="Listener z" value={room.listener.z} onChange={(v) => setListener('z', v)} />
        </div>
      </Section>

      <Section title="What if…">
        <div className="flex gap-3">
          <button
            onClick={addRug}
            disabled={rugCount >= LIMITS.maxRugs}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            + Rug
          </button>
          <button
            onClick={addPanel}
            disabled={panelCount >= LIMITS.maxPanels}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            + Panel
          </button>
        </div>
        {room.fixes.map((fix, i) => {
          const rowLabel =
            fix.kind === 'rug' ? 'Rug' : `Panel ${room.fixes.slice(0, i + 1).filter((f) => f.kind === 'panel').length}`;
          return (
            <div key={i} className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 p-3">
              <label className="flex items-center gap-2 text-sm">
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
                        {RUG_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <NumberField label={`${rowLabel} centre x`} value={fix.x} onChange={(v) => setFix(i, { x: v })} />
                  <NumberField label={`${rowLabel} centre z`} value={fix.z} onChange={(v) => setFix(i, { z: v })} />
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
                  <NumberField label={`${rowLabel} along wall`} value={fix.u} onChange={(v) => setFix(i, { u: v })} />
                  <NumberField label={`${rowLabel} height`} value={fix.v} onChange={(v) => setFix(i, { v })} />
                </>
              )}
              <button
                onClick={() => removeFix(i)}
                aria-label={`Remove ${rowLabel.toLowerCase()}`}
                className="text-sm text-red-400"
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
            <li key={`${e.field}:${e.message}`}>{e.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
