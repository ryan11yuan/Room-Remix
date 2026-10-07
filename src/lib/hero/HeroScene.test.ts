import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { orbit, SCROLL_TURN, turnAt } from './HeroScene';

const close = (a: THREE.Vector3, b: [number, number, number]) => a.toArray().forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));

describe('the hero camera', () => {
  const pivot = new THREE.Vector3(1, 0.5, 0);
  const offset = new THREE.Vector3(0, 0, 2); // the video's first camera, 2 behind the pivot

  it('starts where the video began', () => {
    close(orbit(pivot, offset, turnAt(0, 0, 0, false), 1), [1, 0.5, 2]);
  });

  it('turns about the vertical through the pivot, keeping its height and distance', () => {
    close(orbit(pivot, offset, Math.PI / 2, 1), [3, 0.5, 0]);
  });

  it('comes closer as it dollies in', () => {
    close(orbit(pivot, offset, 0, 0.5), [1, 0.5, 1]);
  });

  it('turns the full scroll turn once the next section has scrolled over the hero', () => {
    expect(turnAt(0, 1, 0, false)).toBeCloseTo(SCROLL_TURN, 9);
  });

  it('holds still for reduced motion, whatever the scroll, pointer or time', () => {
    expect(turnAt(7, 1, 1, true)).toBe(0);
  });
});
