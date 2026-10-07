import * as THREE from 'three';

/** Key code → [right, up, forward], like Memento: W/A/S/D on the floor, Q/E down and up. */
export const MOVE_KEYS: Record<string, [number, number, number]> = {
  KeyW: [0, 0, 1],
  KeyS: [0, 0, -1],
  KeyD: [1, 0, 0],
  KeyA: [-1, 0, 0],
  KeyE: [0, 1, 0],
  KeyQ: [0, -1, 0],
};
/** One frame never moves further than this many seconds' worth (a tab that slept, a long frame). */
export const MAX_STEP_SECONDS = 0.1;
export const PITCH_LIMIT = (85 * Math.PI) / 180;
export const LOOK_SENSITIVITY = 0.0022;

export type Angles = { yaw: number; pitch: number };

const clampPitch = (pitch: number) => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));

/** Yaw 0 looks along -Z and positive yaw turns left (three.js's YXZ order); pitch is up from level. */
export function lookDirection(yaw: number, pitch: number): THREE.Vector3 {
  return new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}

export function anglesOf(direction: THREE.Vector3): Angles {
  const d = direction.clone().normalize();
  return { yaw: Math.atan2(-d.x, -d.z), pitch: clampPitch(Math.asin(Math.max(-1, Math.min(1, d.y)))) };
}

/** Mouse movement turns the head: right turns right, down looks down (pointer lock's movementX/Y). */
export function turn(angles: Angles, dx: number, dy: number, sensitivity = LOOK_SENSITIVITY): Angles {
  return { yaw: angles.yaw - dx * sensitivity, pitch: clampPitch(angles.pitch - dy * sensitivity) };
}

/** This frame's move for the held keys: level with the floor, steered by yaw only; Shift doubles the speed. */
export function moveStep(keys: ReadonlySet<string>, yaw: number, speed: number, seconds: number): THREE.Vector3 {
  let right = 0;
  let up = 0;
  let forward = 0;
  for (const key of keys) {
    const move = MOVE_KEYS[key];
    if (!move) continue;
    right += move[0];
    up += move[1];
    forward += move[2];
  }
  const step = new THREE.Vector3()
    .addScaledVector(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), forward)
    .addScaledVector(new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), right)
    .add(new THREE.Vector3(0, up, 0));
  if (step.lengthSq() === 0) return step;
  const fast = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2 : 1;
  return step.normalize().multiplyScalar(speed * fast * Math.min(Math.max(seconds, 0), MAX_STEP_SECONDS));
}
