import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CameraPose } from '@/lib/splatJobs/protocol';
import { fallbackView, MIN_SPEED, viewFromCameras } from './view';

const UP = new THREE.Vector3(0, 1, 0);

/** A camera as OpenSplat saves it: rotation columns are its right, down and forward axes in world space. */
function camera(name: string, position: [number, number, number], forward: THREE.Vector3, up: THREE.Vector3): CameraPose {
  const f = forward.clone().normalize();
  const u = up.clone().normalize();
  const right = new THREE.Vector3().crossVectors(f, u).normalize();
  const down = u.clone().negate();
  return {
    id: 0, img_name: name, width: 1000, height: 750, fx: 800, fy: 800, position,
    rotation: [
      [right.x, down.x, f.x],
      [right.y, down.y, f.y],
      [right.z, down.z, f.z],
    ],
  };
}

const close = (a: THREE.Vector3, b: THREE.Vector3) => expect(a.distanceTo(b)).toBeLessThan(1e-6);

describe('viewFromCameras', () => {
  it('leaves an upright video as it is and starts at its first frame, looking where it looked', () => {
    const view = viewFromCameras([
      camera('0002.jpg', [4, 0, 3], new THREE.Vector3(1, 0, 0), UP),
      camera('0001.jpg', [0, 0, 0], new THREE.Vector3(0, 0, -1), UP),
    ])!;
    close(UP.clone().applyQuaternion(view.rotation), UP);
    close(view.position, new THREE.Vector3(0, 0, 0));
    close(view.forward, new THREE.Vector3(0, 0, -1));
    expect(view.speed).toBeCloseTo(5 * 0.25); // the camera box is 4 × 0 × 3: diagonal 5
  });

  it('turns an upside-down video upright', () => {
    const down = new THREE.Vector3(0, -1, 0);
    const view = viewFromCameras([camera('0001.jpg', [1, 2, 3], new THREE.Vector3(0, 0, 1), down)])!;
    close(down.clone().applyQuaternion(view.rotation), UP);
    expect(Math.abs(view.forward.y)).toBeLessThan(1e-6); // a level gaze stays level
  });

  it('turns a tilted video upright, using the average up of all its frames', () => {
    const tilt = new THREE.Vector3(1, 1, 0).normalize();
    const z = new THREE.Vector3(0, 0, 1);
    // Two frames leaning 0.2 rad either side of the tilt: their average up is the tilt itself.
    const view = viewFromCameras([
      camera('0001.jpg', [0, 0, 0], new THREE.Vector3(0, 0, -1), tilt.clone().applyAxisAngle(z, 0.2)),
      camera('0002.jpg', [1, 1, 0], new THREE.Vector3(0, 0, -1), tilt.clone().applyAxisAngle(z, -0.2)),
    ])!;
    close(tilt.clone().applyQuaternion(view.rotation), UP);
  });

  it('gives a still camera a usable speed, and nothing without cameras', () => {
    expect(viewFromCameras([camera('0001.jpg', [0, 0, 0], new THREE.Vector3(0, 0, -1), UP)])!.speed).toBe(MIN_SPEED);
    expect(viewFromCameras([])).toBeNull();
  });

  it('turns position, view direction and speed with the room when the video was tilted 45°', () => {
    const up = new THREE.Vector3(1, 1, 0);
    const forward = new THREE.Vector3(1, -1, 0);
    const view = viewFromCameras([
      camera('0002.jpg', [0, 0, 0], forward, up),
      camera('0001.jpg', [0, 2, 0], forward, up),
      camera('0003.jpg', [2, 0, 0], forward, up),
    ])!;
    close(up.clone().normalize().applyQuaternion(view.rotation), UP);
    close(view.position, new THREE.Vector3(-Math.SQRT2, Math.SQRT2, 0)); // (0, 2, 0) turned 45° about Z
    close(view.forward, new THREE.Vector3(1, 0, 0)); // (1, -1, 0) turned 45° about Z
    // The turned cameras span 2√2 × √2 × 0 (diagonal √10); unturned they would span 2 × 2 × 0 (diagonal 2√2).
    expect(view.speed).toBeCloseTo(Math.sqrt(10) * 0.25);
  });

  it("takes the first camera's vertical field of view: 2·atan(height / 2 / fy)", () => {
    const view = viewFromCameras([camera('0001.jpg', [0, 0, 0], new THREE.Vector3(0, 0, -1), UP)])!;
    expect(view.fov).toBeCloseTo((2 * Math.atan(375 / 800) * 180) / Math.PI, 6); // about 50.24
  });

  it('keeps the field of view between 30 and 90 degrees', () => {
    const wide = camera('0001.jpg', [0, 0, 0], new THREE.Vector3(0, 0, -1), UP);
    wide.height = 1000;
    wide.fy = 100;
    expect(viewFromCameras([wide])!.fov).toBe(90);
    const narrow = camera('0001.jpg', [0, 0, 0], new THREE.Vector3(0, 0, -1), UP);
    narrow.height = 100;
    narrow.fy = 1000;
    expect(viewFromCameras([narrow])!.fov).toBe(30);
  });

  it('orders frames numerically so 9.jpg comes before 10.jpg', () => {
    const view = viewFromCameras([
      camera('10.jpg', [5, 0, 0], new THREE.Vector3(0, 0, -1), UP),
      camera('9.jpg', [0, 0, 0], new THREE.Vector3(0, 0, -1), UP),
    ])!;
    close(view.position, new THREE.Vector3(0, 0, 0));
  });
});

describe('fallbackView', () => {
  it('flips the splat like Memento and starts outside its box, looking at its centre', () => {
    const view = fallbackView({ min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 }, centre: { x: 0, y: 0, z: 0 } });
    close(UP.clone().applyQuaternion(view.rotation), new THREE.Vector3(0, -1, 0)); // π about X
    close(view.position, new THREE.Vector3(0, 0.5, 3.6)); // centre + (0, 0.25, 1.8) × the largest side (2)
    close(view.forward, new THREE.Vector3(0, -0.5, -3.6).normalize());
    expect(view.speed).toBeCloseTo(Math.sqrt(12) * 0.25);
  });

  it('flips an off-centre box too, so the start view follows the flipped centre', () => {
    const view = fallbackView({ min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 4, z: 6 }, centre: { x: 1, y: 1, z: 1 } });
    // π about X: the centre (1, 1, 1) becomes (1, -1, -1); the largest side is 6.
    close(view.position, new THREE.Vector3(1, -1 + 6 * 0.25, -1 + 6 * 1.8));
    close(view.forward, new THREE.Vector3(0, -1.5, -10.8).normalize());
    expect(view.speed).toBeCloseTo(Math.sqrt(56) * 0.25);
  });

  it('has no field of view of its own', () => {
    expect(fallbackView({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 }, centre: { x: 0, y: 0, z: 0 } }).fov).toBeUndefined();
  });
});
