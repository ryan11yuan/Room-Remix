import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { anglesOf, lookDirection, MAX_STEP_SECONDS, moveStep, PITCH_LIMIT, turn } from './controls';

const keys = (...codes: string[]) => new Set(codes);
const close = (a: THREE.Vector3, b: THREE.Vector3) => expect(a.distanceTo(b)).toBeLessThan(1e-9);

describe('moveStep', () => {
  it('moves forward, back, left and right level with the floor, relative to yaw', () => {
    close(moveStep(keys('KeyW'), 0, 2, 0.05), new THREE.Vector3(0, 0, -0.1));
    close(moveStep(keys('KeyS'), 0, 2, 0.05), new THREE.Vector3(0, 0, 0.1));
    close(moveStep(keys('KeyD'), 0, 2, 0.05), new THREE.Vector3(0.1, 0, 0));
    close(moveStep(keys('KeyA'), 0, 2, 0.05), new THREE.Vector3(-0.1, 0, 0));
    close(moveStep(keys('KeyW'), Math.PI / 2, 2, 0.05), new THREE.Vector3(-0.1, 0, 0)); // turned left: forward is -X
  });

  it('moves straight down and up with Q and E', () => {
    close(moveStep(keys('KeyQ'), 1.3, 2, 0.05), new THREE.Vector3(0, -0.1, 0));
    close(moveStep(keys('KeyE'), 1.3, 2, 0.05), new THREE.Vector3(0, 0.1, 0));
  });

  it('keeps diagonals at full speed, cancels opposites, doubles with Shift and ignores other keys', () => {
    expect(moveStep(keys('KeyW', 'KeyD'), 0.4, 2, 0.05).length()).toBeCloseTo(0.1);
    expect(moveStep(keys('KeyW', 'KeyS'), 0, 2, 0.05).length()).toBe(0);
    expect(moveStep(keys('KeyW', 'ShiftLeft'), 0, 2, 0.05).length()).toBeCloseTo(0.2);
    expect(moveStep(keys('KeyX', 'Space'), 0, 2, 0.05).length()).toBe(0);
  });

  it('never moves further than one capped frame, however long the tab slept', () => {
    expect(moveStep(keys('KeyW'), 0, 2, 30).length()).toBeCloseTo(2 * MAX_STEP_SECONDS);
    expect(moveStep(keys('KeyW'), 0, 2, -1).length()).toBe(0);
  });

  it('stays level whatever the pitch, because only yaw steers it', () => {
    const { yaw } = anglesOf(new THREE.Vector3(0.0001, -1, 0)); // looking straight down
    const step = moveStep(keys('KeyW'), yaw, 2, 0.05);
    expect(step.y).toBe(0);
    expect(step.length()).toBeCloseTo(0.1);
  });
});

describe('looking around', () => {
  it('turns yaw and pitch from mouse movement, keeping pitch within ±85°', () => {
    expect(turn({ yaw: 0, pitch: 0 }, 100, 0, 0.01)).toEqual({ yaw: -1, pitch: 0 });
    expect(turn({ yaw: 0, pitch: 0 }, 0, -1000, 0.01).pitch).toBeCloseTo(PITCH_LIMIT);
    expect(turn({ yaw: 0, pitch: 0 }, 0, 1000, 0.01).pitch).toBeCloseTo(-PITCH_LIMIT);
  });

  it('round-trips a direction through yaw and pitch', () => {
    const direction = new THREE.Vector3(1, 0.5, -2).normalize();
    const { yaw, pitch } = anglesOf(direction);
    close(lookDirection(yaw, pitch), direction);
    close(lookDirection(0, 0), new THREE.Vector3(0, 0, -1));
  });
});
