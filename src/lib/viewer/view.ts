import * as THREE from 'three';
import type { Vec3 } from '@/lib/room/types';
import type { CameraPose } from '@/lib/splatJobs/protocol';

export type StartView = { rotation: THREE.Quaternion; position: THREE.Vector3; forward: THREE.Vector3; speed: number };

/**
 * Which rotation column, and which sign, is a camera's up and its viewing direction in OpenSplat's cameras file. OpenSplat
 * flips y and z of its internal (OpenGL-style) camera-to-world back when saving, so the columns are the camera's right,
 * down and forward axes. Pinned against a real job on the demo laptop (Plan 7 Task 6).
 */
export const CAMERA_UP = { column: 1, sign: -1 } as const;
export const CAMERA_FORWARD = { column: 2, sign: 1 } as const;
/** Speed for a video whose camera barely moved (a still shot): units per second. */
export const MIN_SPEED = 0.25;

const Y_UP = new THREE.Vector3(0, 1, 0);

function axis(rotation: CameraPose['rotation'], pick: { column: number; sign: number }): THREE.Vector3 {
  return new THREE.Vector3(rotation[0][pick.column], rotation[1][pick.column], rotation[2][pick.column]).multiplyScalar(pick.sign);
}

/** A quarter of the box's diagonal per second, so walking feels the same in any room (spec 2026-10-07 §4). */
function speedFor(box: THREE.Box3): number {
  const diagonal = box.isEmpty() ? 0 : box.getSize(new THREE.Vector3()).length();
  return diagonal > 1e-6 ? diagonal * 0.25 : MIN_SPEED;
}

/**
 * Upright and the start view from the video's cameras: the average camera up becomes +Y (the video was held upright),
 * and the view starts at the first frame (lowest image name), looking along it. Null without usable cameras.
 */
export function viewFromCameras(cameras: CameraPose[]): StartView | null {
  if (cameras.length === 0) return null;
  const up = new THREE.Vector3();
  for (const camera of cameras) up.add(axis(camera.rotation, CAMERA_UP).normalize());
  if (up.lengthSq() < 1e-12) return null;
  const rotation = new THREE.Quaternion().setFromUnitVectors(up.normalize(), Y_UP);
  const first = [...cameras].sort((a, b) => a.img_name.localeCompare(b.img_name))[0];
  const box = new THREE.Box3();
  for (const camera of cameras) box.expandByPoint(new THREE.Vector3(...camera.position).applyQuaternion(rotation));
  return {
    rotation,
    position: new THREE.Vector3(...first.position).applyQuaternion(rotation),
    forward: axis(first.rotation, CAMERA_FORWARD).normalize().applyQuaternion(rotation),
    speed: speedFor(box),
  };
}

/** Memento's view for a room with no cameras file: flip π about X, and start outside the splat's box looking at its centre. */
export function fallbackView(bounds: { min: Vec3; max: Vec3; centre: Vec3 }): StartView {
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  const box = new THREE.Box3()
    .expandByPoint(new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z).applyQuaternion(rotation))
    .expandByPoint(new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z).applyQuaternion(rotation));
  const size = box.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z, 1e-3);
  const centre = new THREE.Vector3(bounds.centre.x, bounds.centre.y, bounds.centre.z).applyQuaternion(rotation);
  const position = centre.clone().add(new THREE.Vector3(0, largest * 0.25, largest * 1.8));
  return { rotation, position, forward: centre.clone().sub(position).normalize(), speed: speedFor(box) };
}
