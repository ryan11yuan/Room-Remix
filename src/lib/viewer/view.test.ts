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
});

describe('fallbackView', () => {
  it('flips the splat like Memento and starts outside its box, looking at its centre', () => {
    const view = fallbackView({ min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 }, centre: { x: 0, y: 0, z: 0 } });
    close(UP.clone().applyQuaternion(view.rotation), new THREE.Vector3(0, -1, 0)); // π about X
    close(view.position, new THREE.Vector3(0, 0.5, 3.6)); // centre + (0, 0.25, 1.8) × the largest side (2)
    close(view.forward, new THREE.Vector3(0, -0.5, -3.6).normalize());
    expect(view.speed).toBeCloseTo(Math.sqrt(12) * 0.25);
  });
});
