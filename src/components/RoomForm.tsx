'use client';

import { MATERIALS } from '@/lib/acoustics/materials';
import { FURNISHING_LABELS, SURFACE_LABELS } from '@/lib/room/labels';
import { validateRoom } from '@/lib/room/roomState';
import { useRoomStore } from '@/lib/room/store';
import { MATERIAL_IDS, SURFACE_IDS, type Furnishing, type MaterialId, type RoomState } from '@/lib/room/types';
import { ErrorList, isFixError } from './ErrorList';
import { inputClass, LengthField } from './LengthField';
import { Toggle } from './Toggle';
import { useUnits } from './useUnits';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">{title}</h3>
      {children}
    </section>
  );
}

/** The room itself: size, surfaces, furnishing, and where the speaker and listener are. Shown under "Edit room". */
export function RoomForm() {
  const room = useRoomStore((s) => s.room);
  const update = useRoomStore((s) => s.update);
  const [unit, setUnit] = useUnits();

  const setDim = (key: keyof RoomState['dims'], value: number) =>
    update((r) => ({ ...r, dims: { ...r.dims, [key]: value } }));
  const setSpeaker = (axis: 'x' | 'y' | 'z', value: number) =>
    update((r) => ({ ...r, speaker: { ...r.speaker, [axis]: value } }));
  const setListener = (axis: 'x' | 'y' | 'z', value: number) =>
    update((r) => ({ ...r, listener: { ...r.listener, [axis]: value } }));

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

      <ErrorList errors={validateRoom(room).filter((e) => !isFixError(e))} unit={unit} />
    </div>
  );
}
