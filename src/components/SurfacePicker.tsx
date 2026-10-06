'use client';

import { MATERIALS } from '@/lib/acoustics/materials';
import { SURFACE_LABELS } from '@/lib/room/labels';
import { DIAGRAM_H, DIAGRAM_W, surfaceDiagram } from '@/lib/room/surfaceDiagram';
import { MATERIAL_IDS, SURFACE_IDS, type MaterialId, type RoomState, type SurfaceId } from '@/lib/room/types';
import { MATERIAL_COLORS } from '@/lib/scene/colors';

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

type SurfacePickerProps = {
  room: RoomState;
  selected: SurfaceId;
  onSelect: (surface: SurfaceId) => void;
  onMaterial: (surface: SurfaceId, material: MaterialId) => void;
};

/**
 * Pick a surface, then its material. The drawing (each surface tinted with its material) is for pointers; the list of
 * six buttons after the materials does the same for keyboards and screen readers, and both stay in step.
 */
export function SurfacePicker({ room, selected, onSelect, onMaterial }: SurfacePickerProps) {
  // The selected surface is drawn last, so its outline isn't painted over by its neighbours.
  const shapes = surfaceDiagram(room.dims).sort((a, b) => Number(a.surface === selected) - Number(b.surface === selected));
  return (
    <div className="flex flex-col gap-4">
      <svg viewBox={`0 0 ${DIAGRAM_W} ${DIAGRAM_H}`} aria-hidden="true" className="block w-full select-none">
        {shapes.map(({ surface, points, label }) => {
          const isSelected = surface === selected;
          return (
            <g key={surface} onClick={() => onSelect(surface)} className="cursor-pointer">
              <polygon
                points={points.map((p) => p.join(',')).join(' ')}
                fill={hex(MATERIAL_COLORS[room.surfaces[surface]])}
                fillOpacity={isSelected ? 0.95 : 0.6}
                stroke={isSelected ? 'white' : '#404040'}
                strokeWidth={isSelected ? 3 : 1}
                strokeDasharray={surface === 'wallX1' ? '6 4' : undefined}
              />
              <text
                x={label[0]}
                y={label[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={surface === 'wallZ0' || surface === 'wallZ1' ? `rotate(-90 ${label[0]} ${label[1]})` : undefined}
                stroke="#0a0a0a"
                strokeWidth={3}
                paintOrder="stroke"
                className="fill-white text-[11px] font-semibold"
              >
                {surface === 'wallX1' ? 'Back wall (behind you)' : SURFACE_LABELS[surface]}
              </text>
            </g>
          );
        })}
      </svg>

      {/* The selected surface's materials right under the drawing, so a tap and its choice sit together on a phone. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">{SURFACE_LABELS[selected]}: what is it made of?</legend>
        <div className="grid grid-cols-2 gap-1">
          {MATERIAL_IDS.map((material) => (
            <label key={material} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="surface-material"
                checked={room.surfaces[selected] === material}
                onChange={() => onMaterial(selected, material)}
              />
              {MATERIALS[material].label}
            </label>
          ))}
        </div>
      </fieldset>

      <ul aria-label="Surfaces" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SURFACE_IDS.map((surface) => (
          <li key={surface}>
            <button
              type="button"
              aria-pressed={surface === selected}
              onClick={() => onSelect(surface)}
              className={`flex min-h-11 w-full items-center gap-2 rounded-md border px-3 text-left text-sm ${surface === selected ? 'border-white' : 'border-neutral-700'}`}
            >
              <span aria-hidden="true" className="size-3 shrink-0 rounded-sm" style={{ background: hex(MATERIAL_COLORS[room.surfaces[surface]]) }} />
              {SURFACE_LABELS[surface]}: {MATERIALS[room.surfaces[surface]].label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
