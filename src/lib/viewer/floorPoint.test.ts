import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { floorPoint } from './floorPoint';

describe('floorPoint', () => {
  it('meets the floor ahead, and is null looking up or level', () => {
    const down = new THREE.Ray(new THREE.Vector3(0, 2, 0), new THREE.Vector3(1, -1, 0).normalize());
    expect(floorPoint(down, 0.5)!.toArray().map((v) => +v.toFixed(6))).toEqual([1.5, 0.5, 0]);
    expect(floorPoint(new THREE.Ray(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 1, 0)), 0)).toBeNull();
    expect(floorPoint(new THREE.Ray(new THREE.Vector3(0, 2, 0), new THREE.Vector3(1, 0, 0)), 0)).toBeNull();
  });
});
