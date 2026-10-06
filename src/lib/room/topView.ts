import { listenerYaw } from '@/lib/acoustics/binaural';
import { PANEL_SIZE, RUG_SIZES } from './constants';
import { applyDrag, type DragTarget } from './placement';
import type { Dims, PanelFix, RoomState, RugFix } from './types';
import { formatLength, type Unit } from './units';

/**
 * The top view: the floor plan as the 3D view's Top camera shows it. x (front wall to back wall) runs to the right and
 * z (right wall to left wall) runs down, so the front wall is on the left and the right wall at the top.
 */

/** The drawing's size in SVG units. The SVG scales to its column and keeps this 4:3 shape. */
export const PLAN_W = 320;
export const PLAN_H = 240;
/** Space around the room for the wall labels. */
export const PLAN_PAD = 28;
/** A strip along the bottom of the drawing for the scale bar, below the bottom wall's label. */
export const PLAN_BAR_H = 20;
/** How far one arrow-key press moves an item, in metres. */
export const NUDGE_M = 0.1;

/** Where the room sits in the drawing: `scale` units per metre, with the room's x = 0, z = 0 corner at (left, top). */
export type Plan = { scale: number; left: number; top: number };
export type Segment = { x1: number; y1: number; x2: number; y2: number };
export type PlanRect = { x: number; y: number; width: number; height: number };
/** Where an item was grabbed, relative to its centre, in metres: kept through the drag so the item doesn't jump. */
export type Grab = { x: number; z: number };

const usable = (d: number) => Number.isFinite(d) && d > 0;
const mm = (metres: number) => Math.round(metres * 1000) / 1000;

/** Fit the floor into a widthPx × heightPx drawing with padPx on every side, centred, keeping its shape. Null while a size is mid-edit. */
export function fitPlan(dims: Dims, widthPx: number, heightPx: number, padPx: number): Plan | null {
  const w = widthPx - 2 * padPx;
  const h = heightPx - 2 * padPx;
  if (!usable(dims.length) || !usable(dims.width) || !(w > 0) || !(h > 0)) return null;
  const scale = Math.min(w / dims.length, h / dims.width);
  return { scale, left: (widthPx - dims.length * scale) / 2, top: (heightPx - dims.width * scale) / 2 };
}

/** The top view's plan for a room: the floor fitted above the scale bar's strip. Null while a size is mid-edit. */
export function planFor(dims: Dims): Plan | null {
  return fitPlan(dims, PLAN_W, PLAN_H - PLAN_BAR_H, PLAN_PAD);
}

/** A floor point (metres) in the drawing. */
export function toPlan(plan: Plan, p: { x: number; z: number }): { px: number; py: number } {
  return { px: plan.left + p.x * plan.scale, py: plan.top + p.z * plan.scale };
}

/** A drawing point as a floor point (metres). Points outside the room come back outside it. */
export function fromPlan(plan: Plan, px: number, py: number): { x: number; z: number } {
  return { x: (px - plan.left) / plan.scale, z: (py - plan.top) / plan.scale };
}

/**
 * A pointer position (client pixels) in drawing units, for an SVG of PLAN_W × PLAN_H laid out in `rect`. Null while the
 * SVG has no size yet, so a pointer event can never turn into a NaN position.
 */
export function clientToPlan(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): { px: number; py: number } | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  return { px: ((clientX - rect.left) / rect.width) * PLAN_W, py: ((clientY - rect.top) / rect.height) * PLAN_H };
}

/** Where a draggable item is on the floor: the speaker, the listener or a rug's centre. Null for a rug that isn't there. */
export function itemPosition(room: RoomState, target: DragTarget): { x: number; z: number } | null {
  if (target.kind === 'speaker') return { x: room.speaker.x, z: room.speaker.z };
  if (target.kind === 'listener') return { x: room.listener.x, z: room.listener.z };
  const fix = room.fixes[target.index];
  return fix?.kind === 'rug' ? { x: fix.x, z: fix.z } : null;
}

/**
 * Move a dragged item to a drawing point, offset by where it was grabbed. A point outside the room (a drag that left the
 * drawing) is clamped by applyDrag like any other: 0.3 m from the walls, or the rug on the floor.
 */
export function dragTo(room: RoomState, plan: Plan, target: DragTarget, px: number, py: number, grab: Grab = { x: 0, z: 0 }): RoomState {
  if (![px, py, grab.x, grab.z].every(Number.isFinite)) return room;
  const p = fromPlan(plan, px, py);
  return applyDrag(room, target, { x: p.x + grab.x, y: 0, z: p.z + grab.z });
}

function arrowStep(key: string): { dx: number; dz: number } | null {
  switch (key) {
    case 'ArrowLeft':
      return { dx: -1, dz: 0 };
    case 'ArrowRight':
      return { dx: 1, dz: 0 };
    case 'ArrowUp':
      return { dx: 0, dz: -1 };
    case 'ArrowDown':
      return { dx: 0, dz: 1 };
    default:
      return null;
  }
}

/**
 * Move an item 0.1 m with an arrow key, the way it looks in the drawing (Up is toward the right wall). Rounded to the
 * millimetre so repeated presses don't gather float noise. Null for any other key, so the page can scroll as usual.
 */
export function nudge(room: RoomState, target: DragTarget, key: string): RoomState | null {
  const step = arrowStep(key);
  const at = itemPosition(room, target);
  if (!step || !at) return null;
  return applyDrag(room, target, { x: mm(at.x + step.dx * NUDGE_M), y: 0, z: mm(at.z + step.dz * NUDGE_M) });
}

const ITEM_NAMES: Record<DragTarget['kind'], string> = { speaker: 'Speaker', listener: 'Listener', rug: 'Rug centre' };

/** What a screen reader hears for a draggable item: its distances from the front and right walls, in `unit`. */
export function itemLabel(room: RoomState, target: DragTarget, unit: Unit): string {
  const name = ITEM_NAMES[target.kind];
  const at = itemPosition(room, target);
  if (!at) return name;
  const distance = (m: number) => (Number.isFinite(m) ? `${formatLength(m, unit)} ${unit}` : 'an unknown distance');
  return `${name}, ${distance(at.x)} from the front wall and ${distance(at.z)} from the right wall`;
}

/** The description every draggable item shares. */
export function nudgeHint(unit: Unit): string {
  return `Drag it, or use the arrow keys to move it ${formatLength(NUDGE_M, unit)} ${unit} at a time.`;
}

/** A rug's rectangle in the drawing, cut to the floor: a rug bigger than the room is drawn as the floor it covers. */
export function rugRect(plan: Plan, dims: Dims, rug: RugFix): PlanRect | null {
  const size = RUG_SIZES[rug.size];
  if (![rug.x, rug.z, dims.length, dims.width].every(Number.isFinite)) return null;
  const x0 = Math.max(0, rug.x - size.x / 2);
  const x1 = Math.min(dims.length, rug.x + size.x / 2);
  const z0 = Math.max(0, rug.z - size.z / 2);
  const z1 = Math.min(dims.width, rug.z + size.z / 2);
  const corner = toPlan(plan, { x: x0, z: z0 });
  return { x: corner.px, y: corner.py, width: Math.max(0, x1 - x0) * plan.scale, height: Math.max(0, z1 - z0) * plan.scale };
}

/** A panel as a thick line along its wall. (Panels are placed with "+ Panel" or in the 3D view; the top view only shows them.) */
export function panelSegment(plan: Plan, dims: Dims, panel: PanelFix): Segment | null {
  if (![panel.u, dims.length, dims.width].every(Number.isFinite)) return null;
  const a = panel.u - PANEL_SIZE.u / 2;
  const b = panel.u + PANEL_SIZE.u / 2;
  const [from, to] =
    panel.wall === 'wallX0'
      ? [{ x: 0, z: a }, { x: 0, z: b }]
      : panel.wall === 'wallX1'
        ? [{ x: dims.length, z: a }, { x: dims.length, z: b }]
        : panel.wall === 'wallZ0'
          ? [{ x: a, z: 0 }, { x: b, z: 0 }]
          : [{ x: a, z: dims.width }, { x: b, z: dims.width }];
  const p = toPlan(plan, from);
  const q = toPlan(plan, to);
  return { x1: p.px, y1: p.py, x2: q.px, y2: q.py };
}

/** The way the listener faces, as an arrow `metres` long from their position. Null while a position is mid-edit. */
export function facingArrow(plan: Plan, room: RoomState, metres = 0.5): Segment | null {
  const yaw = listenerYaw(room.listener, room.speaker);
  if (![yaw, room.listener.x, room.listener.z].every(Number.isFinite)) return null;
  const from = toPlan(plan, room.listener);
  const to = toPlan(plan, { x: room.listener.x + Math.cos(yaw) * metres, z: room.listener.z + Math.sin(yaw) * metres });
  return { x1: from.px, y1: from.py, x2: to.px, y2: to.py };
}

/** The corners of an arrowhead at the end of `segment`, `size` units long, as SVG polygon points ("x,y x,y x,y"). */
export function arrowHead(segment: Segment, size = 7): string {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const bx = segment.x2 - ux * size; // the middle of the head's base, `size` back along the arrow
  const by = segment.y2 - uy * size;
  const half = size * 0.6;
  return [
    [segment.x2, segment.y2],
    [bx - uy * half, by + ux * half],
    [bx + uy * half, by - ux * half],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(' ');
}

/** The scale bar, in the strip along the bottom of the drawing: 1 m, or 3 ft when lengths are shown in feet. */
export function scaleBar(plan: Plan, unit: Unit): Segment & { label: string } {
  const metres = unit === 'ft' ? 3 * 0.3048 : 1;
  const y = PLAN_H - PLAN_BAR_H / 2;
  return { x1: PLAN_PAD, y1: y, x2: PLAN_PAD + metres * plan.scale, y2: y, label: unit === 'ft' ? '3 ft' : '1 m' };
}
