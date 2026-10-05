import * as THREE from 'three';
import { listenerYaw } from '@/lib/acoustics/binaural';
import type { DragTarget } from '@/lib/room/placement';
import { SURFACE_IDS, type RoomState, type SurfaceId } from '@/lib/room/types';
import { LISTENER_COLOR, MATERIAL_COLORS, SPEAKER_COLOR } from './colors';
import { fixQuad, surfaceQuad, type Quad } from './layout';

const PANEL_THICKNESS = 0.04;
const PICK_RADIUS = 0.25; // invisible grab sphere: ~44 pt at the default view on a phone

/** What a mesh stands for when it's picked: stored in `userData.handle`. */
export type Handle = DragTarget | { kind: 'panel'; index: number };

/** Orient a plane-shaped object (built in XY, facing +Z) onto a quad. */
function placeOnQuad(object: THREE.Object3D, quad: Quad): void {
  const u = new THREE.Vector3(quad.uAxis.x, quad.uAxis.y, quad.uAxis.z);
  const n = new THREE.Vector3(quad.normal.x, quad.normal.y, quad.normal.z);
  const v = new THREE.Vector3().crossVectors(n, u); // keeps the basis right-handed, so it's a pure rotation
  object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n));
  object.position.set(quad.center.x, quad.center.y, quad.center.z);
}

/** Translucent surfaces tinted by material, the room's edges and a floor grid. Rebuild when size or materials change. */
export function buildShell(room: RoomState): THREE.Group {
  const group = new THREE.Group();
  group.name = 'shell';
  for (const surface of SURFACE_IDS) {
    const quad = surfaceQuad(room.dims, surface);
    const material = new THREE.MeshBasicMaterial({
      color: MATERIAL_COLORS[room.surfaces[surface]],
      transparent: true,
      opacity: surface === 'floor' ? 0.55 : 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(quad.width, quad.height), material);
    placeOnQuad(mesh, quad);
    mesh.name = surface;
    mesh.userData = { surface } satisfies { surface: SurfaceId };
    group.add(mesh);
  }

  const { length: L, width: W, height: H } = room.dims;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, W)),
    new THREE.LineBasicMaterial({ color: 0x9ca3af }),
  );
  edges.position.set(L / 2, H / 2, W / 2);
  edges.name = 'edges';
  group.add(edges);

  const size = Math.max(L, W);
  const grid = new THREE.GridHelper(size, Math.ceil(size), 0x52525b, 0x3f3f46);
  grid.position.set(L / 2, 0.002, W / 2);
  grid.name = 'grid';
  group.add(grid);
  return group;
}

/** An invisible sphere that still catches the raycaster (it doesn't check `visible`), so a fingertip can grab a small handle. */
function buildPickSphere(handle: Handle): THREE.Mesh {
  const pick = new THREE.Mesh(new THREE.SphereGeometry(PICK_RADIUS, 12, 8), new THREE.MeshBasicMaterial());
  pick.visible = false;
  pick.name = 'pick';
  pick.userData = { handle };
  return pick;
}

export function buildSpeaker(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.22), new THREE.MeshBasicMaterial({ color: SPEAKER_COLOR }));
  mesh.name = 'speaker';
  mesh.userData = { handle: { kind: 'speaker' } satisfies Handle };
  mesh.add(buildPickSphere({ kind: 'speaker' }));
  return mesh;
}

export function buildListener(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'listener';
  const material = new THREE.MeshBasicMaterial({ color: LISTENER_COLOR });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), material);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 12), material);
  nose.rotation.z = -Math.PI / 2; // the cone points along +x: the facing direction at yaw 0
  nose.position.x = 0.13;
  for (const part of [head, nose]) {
    part.userData = { handle: { kind: 'listener' } satisfies Handle };
    group.add(part);
  }
  group.add(buildPickSphere({ kind: 'listener' }));
  return group;
}

export function placeSpeaker(object: THREE.Object3D, room: RoomState): void {
  object.position.set(room.speaker.x, room.speaker.y, room.speaker.z);
}

/** Position the listener and turn them to face where they're facing (three.js yaw is the negative of ours). */
export function placeListener(object: THREE.Object3D, room: RoomState): void {
  object.position.set(room.listener.x, room.listener.y, room.listener.z);
  object.rotation.y = -listenerYaw(room.listener, room.speaker);
}

/** One mesh per fix, in order; switched-off fixes are drawn faint. */
export function buildFixes(room: RoomState): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fixes';
  room.fixes.forEach((fix, index) => {
    const quad = fixQuad(room.dims, fix);
    const material = new THREE.MeshBasicMaterial({
      color: MATERIAL_COLORS[fix.kind === 'rug' ? 'rug' : 'acousticPanel'],
      transparent: true,
      opacity: fix.on ? 0.9 : 0.25,
      side: THREE.DoubleSide,
    });
    const geometry =
      fix.kind === 'rug'
        ? new THREE.PlaneGeometry(quad.width, quad.height)
        : new THREE.BoxGeometry(quad.width, quad.height, PANEL_THICKNESS);
    const mesh = new THREE.Mesh(geometry, material);
    placeOnQuad(mesh, quad);
    if (fix.kind === 'panel') mesh.translateZ(PANEL_THICKNESS / 2); // local Z is the inward normal: sit on the wall, not in it
    const handle: Handle = fix.kind === 'rug' ? { kind: 'rug', index } : { kind: 'panel', index };
    mesh.userData = { handle };
    group.add(mesh);
  });
  return group;
}

/** Free the GPU resources of everything under an object. */
export function disposeTree(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}
