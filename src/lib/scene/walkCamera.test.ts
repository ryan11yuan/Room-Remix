import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { describe, expect, it } from 'vitest';
import { defaultRoom } from '@/lib/room/roomState';
import type { Dims, Vec3 } from '@/lib/room/types';
import { CAMERA_MARGIN, clampInside, walkView } from './walk';
import { drawFrom, followHead } from './walkCamera';

// These run the real OrbitControls (it needs no DOM element in Node), set up the way RoomScene sets it up.
const ROOM = { length: 6, width: 5, height: 2.6 };

function start(dims: Dims = ROOM) {
  const room = { ...defaultRoom(), dims };
  const head: Vec3 = { x: room.listener.x, y: room.listener.y, z: room.listener.z };
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
  const controls = new OrbitControls(camera, null);
  controls.enableDamping = true;
  const draw = new THREE.PerspectiveCamera();
  const view = walkView(room);
  camera.position.set(view.position.x, view.position.y, view.position.z);
  controls.target.set(view.target.x, view.target.y, view.target.z);
  controls.update();
  followHead(camera, controls, draw, dims, head);
  return { dims, head, camera, controls, draw };
}

const distance = (camera: THREE.Camera, controls: OrbitControls) => camera.position.distanceTo(controls.target);
const expectInside = (p: THREE.Vector3, d: Dims) => {
  for (const [value, size] of [[p.x, d.length], [p.y, d.height], [p.z, d.width]]) {
    expect(value).toBeGreaterThanOrEqual(CAMERA_MARGIN - 1e-9);
    expect(value).toBeLessThanOrEqual(size - CAMERA_MARGIN + 1e-9);
  }
};
/** How far the camera's view direction is from pointing at `target`: the sine of the angle between them. */
function aimError(camera: THREE.Camera, target: THREE.Vector3): number {
  const view = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const toTarget = target.clone().sub(camera.position).normalize();
  expect(view.dot(toTarget)).toBeGreaterThan(0);
  return view.cross(toTarget).length();
}

describe('followHead', () => {
  it('(a) keeps a zoom made between frames', () => {
    const { head, camera, controls, draw, dims } = start();
    // What OrbitControls' wheel handler does: change the camera and call update() at event time.
    camera.position.lerp(controls.target, 0.5);
    controls.update();
    const zoomed = distance(camera, controls);
    followHead(camera, controls, draw, dims, head);
    expect(distance(camera, controls)).toBeCloseTo(zoomed, 9);
  });

  it('(b) carries the orbit along with a walking head, keeping the view offset', () => {
    const { head, camera, controls, draw, dims } = start();
    const before = camera.position.clone();
    const offset = camera.position.clone().sub(controls.target);
    followHead(camera, controls, draw, dims, { ...head, x: head.x + 0.5 });
    expect(camera.position.x - before.x).toBeCloseTo(0.5, 9);
    expect(camera.position.y).toBeCloseTo(before.y, 9);
    expect(camera.position.z).toBeCloseTo(before.z, 9);
    const moved = camera.position.clone().sub(controls.target);
    expect(moved.distanceTo(offset)).toBeLessThan(1e-9);
  });

  it('(c) draws an orbit camera that is outside the room from inside it, still looking at the target', () => {
    const { head, camera, controls, draw, dims } = start();
    camera.position.set(head.x + 6, 1.4, head.z + 5); // beyond the back and left walls
    controls.update();
    followHead(camera, controls, draw, dims, head);
    expect(camera.position.x).toBeGreaterThan(dims.length); // the orbit camera itself stays where the user put it
    expectInside(draw.position, dims);
    expect(aimError(draw, controls.target)).toBeLessThan(1e-9);
  });

  it.each([
    ['x is NaN', { x: Number.NaN, y: 1.1, z: 1.9 }],
    ['y is NaN', { x: 3, y: Number.NaN, z: 1.9 }],
    ['z is infinite', { x: 3, y: 1.1, z: Infinity }],
  ])('(d) leaves both cameras and the target exactly as they were when the head %s', (_, head) => {
    const { camera, controls, draw, dims } = start();
    const before = [camera.position.toArray(), camera.quaternion.toArray(), controls.target.toArray(), draw.position.toArray(), draw.quaternion.toArray()];
    followHead(camera, controls, draw, dims, head);
    const after = [camera.position.toArray(), camera.quaternion.toArray(), controls.target.toArray(), draw.position.toArray(), draw.quaternion.toArray()];
    expect(after).toEqual(before);
    expect(after.flat().every(Number.isFinite)).toBe(true);
  });

  it('(e) follows a head that is outside the room (the room shrank past the listener) from inside it', () => {
    const small = { length: 2.5, width: 3.5, height: 2.6 };
    const { camera, controls, draw } = start(small);
    const outside = { x: 3, y: 1.1, z: 1.9 }; // beyond the back wall at x = 2.5
    followHead(camera, controls, draw, small, outside);
    const centre = clampInside(small, outside);
    expect(controls.target.toArray()).toEqual([centre.x, centre.y, centre.z]);
    expectInside(draw.position, small);
    // The camera is behind the head and the head is at the wall's margin, so the draw camera may sit right on the head:
    // a short view, but a finite one.
    expect([...draw.position.toArray(), ...draw.quaternion.toArray(), ...camera.position.toArray()].every(Number.isFinite)).toBe(true);
  });
});

describe('drawFrom', () => {
  it('draws from the orbit camera itself when it is already inside the room', () => {
    const { camera, controls, draw, dims } = start();
    drawFrom(camera, controls.target, draw, dims);
    expect(draw.position.distanceTo(camera.position)).toBeLessThan(1e-12);
  });
});
