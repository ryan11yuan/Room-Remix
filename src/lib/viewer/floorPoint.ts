import * as THREE from 'three';

/** Where a click's ray meets the floor plane y = floorY (spec §5: the floor plane, not the splat). Null if it never does. */
export function floorPoint(ray: THREE.Ray, floorY: number): THREE.Vector3 | null {
  if (ray.direction.y > -1e-6) return null;
  return ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY), new THREE.Vector3());
}
