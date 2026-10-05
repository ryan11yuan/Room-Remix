import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Dims, Vec3 } from '@/lib/room/types';
import { clampInside, pullInside } from './walk';

/**
 * One walk-mode frame for the cameras. Carry the orbit along with the head, keeping the user's turn and zoom, which
 * OrbitControls applies to `camera` in its own event handlers. Then draw from `camera` pulled inside the room.
 * A head that isn't a finite point leaves both cameras as they are.
 */
export function followHead(camera: THREE.PerspectiveCamera, controls: OrbitControls, draw: THREE.PerspectiveCamera, dims: Dims, head: Vec3): void {
  if (![head.x, head.y, head.z].every(Number.isFinite)) return;
  const centre = clampInside(dims, head);
  camera.position.sub(controls.target).add(new THREE.Vector3(centre.x, centre.y, centre.z));
  controls.target.set(centre.x, centre.y, centre.z);
  controls.update();
  drawFrom(camera, controls.target, draw, dims);
}

/** `draw` becomes `camera` pulled inside the room, still looking at `target`. */
export function drawFrom(camera: THREE.PerspectiveCamera, target: THREE.Vector3, draw: THREE.PerspectiveCamera, dims: Dims): void {
  draw.copy(camera);
  const inside = pullInside(dims, target, camera.position);
  draw.position.set(inside.x, inside.y, inside.z);
  draw.lookAt(target);
  draw.updateMatrixWorld();
}
