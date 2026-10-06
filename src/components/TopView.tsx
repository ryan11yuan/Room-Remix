'use client';

import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { SURFACE_LABELS } from '@/lib/room/labels';
import type { DragTarget } from '@/lib/room/placement';
import {
  arrowHead,
  clientToPlan,
  dragTo,
  facingArrow,
  fromPlan,
  itemLabel,
  itemPosition,
  nudge,
  nudgeHint,
  panelSegment,
  PLAN_H,
  PLAN_W,
  planFor,
  rugRect,
  scaleBar,
  toPlan,
  type Grab,
} from '@/lib/room/topView';
import type { RoomState } from '@/lib/room/types';
import type { Unit } from '@/lib/room/units';
import { LISTENER_COLOR, MATERIAL_COLORS, SPEAKER_COLOR } from '@/lib/scene/colors';

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
const HIT_R = 22; // a 44-unit circle: at least 44 px across at phone width
const DOT_R = 8;
const SPEAKER: DragTarget = { kind: 'speaker' };
const LISTENER: DragTarget = { kind: 'listener' };
const wallText = 'fill-neutral-400 text-[11px]';

type TopViewProps = {
  room: RoomState;
  /** Apply a change to the room: the store's `update`, or the wizard's. */
  onChange: (change: (room: RoomState) => RoomState) => void;
  unit: Unit;
  /** The drawing's accessible name. */
  label: string;
};

/**
 * The room from above, as the 3D view's Top camera shows it (front wall on the left, right wall at the top). Drag the
 * speaker, the listener or the rug, or focus one and use the arrow keys. Panels are shown, not placed: "+ Panel" finds
 * a free spot, and the 3D view places one where you tap.
 */
export function TopView({ room, onChange, unit, label }: TopViewProps) {
  const [drag, setDrag] = useState<{ target: DragTarget; pointerId: number; grab: Grab } | null>(null);
  const hintId = useId();
  const plan = planFor(room.dims);
  if (!plan) return <p className="text-sm text-neutral-400">Enter the room&apos;s size to see it from above.</p>;

  const corner = toPlan(plan, { x: 0, z: 0 });
  const far = toPlan(plan, { x: room.dims.length, z: room.dims.width });
  const middle = { x: (corner.px + far.px) / 2, y: (corner.py + far.py) / 2 };
  const placed = (p: { x: number; z: number }) => (Number.isFinite(p.x) && Number.isFinite(p.z) ? toPlan(plan, p) : null);
  const speaker = placed(room.speaker);
  const listener = placed(room.listener);
  const arrow = facingArrow(plan, room);
  const bar = scaleBar(plan, unit);

  function pointerPoint(e: PointerEvent<SVGGElement>) {
    const svg = e.currentTarget.ownerSVGElement;
    return svg ? clientToPlan(svg.getBoundingClientRect(), e.clientX, e.clientY) : null;
  }

  function startDrag(target: DragTarget, e: PointerEvent<SVGGElement>) {
    const point = pointerPoint(e);
    const at = itemPosition(room, target);
    if (!plan || !point || !at) return;
    const p = fromPlan(plan, point.px, point.py);
    e.currentTarget.setPointerCapture(e.pointerId); // moves outside the drawing keep coming here; applyDrag clamps them
    setDrag({ target, pointerId: e.pointerId, grab: { x: at.x - p.x, z: at.z - p.z } });
  }

  function moveDrag(e: PointerEvent<SVGGElement>) {
    const point = pointerPoint(e);
    if (!plan || !drag || drag.pointerId !== e.pointerId || !point) return;
    onChange((r) => dragTo(r, plan, drag.target, point.px, point.py, drag.grab));
  }

  function endDrag(e: PointerEvent<SVGGElement>) {
    if (drag?.pointerId === e.pointerId) setDrag(null);
  }

  function onKey(target: DragTarget, e: KeyboardEvent<SVGGElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return; // Alt+Left (back in history) and the like stay the browser's
    if (!nudge(room, target, e.key)) return; // not an arrow key: the page keeps it
    e.preventDefault();
    onChange((r) => nudge(r, target, e.key) ?? r);
  }

  /** What makes an item draggable, focusable and movable with the arrow keys. */
  const handle = (target: DragTarget) => ({
    role: 'button',
    tabIndex: 0,
    'aria-label': itemLabel(room, target, unit),
    'aria-describedby': hintId,
    className: 'group cursor-grab outline-none',
    onPointerDown: (e: PointerEvent<SVGGElement>) => startDrag(target, e),
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onKeyDown: (e: KeyboardEvent<SVGGElement>) => onKey(target, e),
  });

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${PLAN_W} ${PLAN_H}`}
        role="group"
        aria-label={label}
        className="block aspect-[4/3] w-full touch-none select-none rounded-xl border border-neutral-800 bg-neutral-950"
      >
        <rect
          x={corner.px}
          y={corner.py}
          width={far.px - corner.px}
          height={far.py - corner.py}
          className="fill-neutral-900 stroke-neutral-500"
          strokeWidth={1.5}
        />
        <text x={middle.x} y={corner.py - 8} textAnchor="middle" className={wallText}>
          {SURFACE_LABELS.wallZ0}
        </text>
        <text x={middle.x} y={far.py + 16} textAnchor="middle" className={wallText}>
          {SURFACE_LABELS.wallZ1}
        </text>
        <text transform={`translate(${corner.px - 8} ${middle.y}) rotate(-90)`} textAnchor="middle" className={wallText}>
          {SURFACE_LABELS.wallX0}
        </text>
        <text transform={`translate(${far.px + 8} ${middle.y}) rotate(90)`} textAnchor="middle" className={wallText}>
          {SURFACE_LABELS.wallX1}
        </text>

        {room.fixes.map((fix, index) => {
          if (fix.kind === 'panel') {
            const segment = panelSegment(plan, room.dims, fix);
            return (
              segment && (
                <line key={index} {...segment} stroke={hex(MATERIAL_COLORS.acousticPanel)} strokeWidth={5} strokeOpacity={fix.on ? 1 : 0.4} />
              )
            );
          }
          const rect = rugRect(plan, room.dims, fix);
          return (
            rect && (
              <g key={index} {...handle({ kind: 'rug', index })}>
                <rect {...rect} fill={hex(MATERIAL_COLORS.rug)} fillOpacity={fix.on ? 0.6 : 0.25} />
                <rect {...rect} fill="none" stroke="white" strokeWidth={2} className="opacity-0 group-focus-visible:opacity-100" />
              </g>
            )
          );
        })}

        {speaker && (
          <g {...handle(SPEAKER)}>
            <circle cx={speaker.px} cy={speaker.py} r={HIT_R} fill="transparent" />
            <circle cx={speaker.px} cy={speaker.py} r={DOT_R} fill={hex(SPEAKER_COLOR)} />
            <circle cx={speaker.px} cy={speaker.py} r={DOT_R + 5} fill="none" stroke="white" strokeWidth={2} className="opacity-0 group-focus-visible:opacity-100" />
          </g>
        )}
        {arrow && (
          <g pointerEvents="none">
            <line {...arrow} stroke={hex(LISTENER_COLOR)} strokeWidth={2} />
            <polygon points={arrowHead(arrow)} fill={hex(LISTENER_COLOR)} />
          </g>
        )}
        {listener && (
          <g {...handle(LISTENER)}>
            <circle cx={listener.px} cy={listener.py} r={HIT_R} fill="transparent" />
            <circle cx={listener.px} cy={listener.py} r={DOT_R} fill={hex(LISTENER_COLOR)} />
            <circle cx={listener.px} cy={listener.py} r={DOT_R + 5} fill="none" stroke="white" strokeWidth={2} className="opacity-0 group-focus-visible:opacity-100" />
          </g>
        )}

        <line x1={bar.x1} y1={bar.y1} x2={bar.x2} y2={bar.y2} className="stroke-neutral-300" strokeWidth={2} />
        <text x={bar.x2 + 6} y={bar.y1 + 4} className={wallText}>
          {bar.label}
        </text>
      </svg>
      <p id={hintId} className="sr-only">
        {nudgeHint(unit)}
      </p>
    </div>
  );
}
