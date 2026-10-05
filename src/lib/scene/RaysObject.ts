import * as THREE from 'three';
import type { RayPath } from '@/lib/acoustics/rays';
import { RAY_COLOR } from './colors';
import { buildRayBuffers } from './rayBuffers';

export const PULSE_SPEED = 343 / 200; // metres of path per second: sound slowed 200× so the eye can follow
const PAUSE_SECONDS = 0.8; // gap before the next pulse leaves the speaker

const vertexShader = /* glsl */ `
  attribute float arc;
  attribute float energy;
  attribute float strength;
  varying float vArc;
  varying float vEnergy;
  varying float vStrength;
  void main() {
    vArc = arc;
    vEnergy = energy;
    vStrength = strength;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uFront;
  uniform vec3 uColor;
  varying float vArc;
  varying float vEnergy;
  varying float vStrength;
  void main() {
    float behind = uFront - vArc;                          // metres since the pulse passed this point
    float pulse = behind < 0.0 ? 0.0 : exp(-behind / 0.5); // bright head with a short fading trail
    float level = (0.08 + pulse) * vEnergy * (0.25 + 0.75 * vStrength);
    gl_FragColor = vec4(uColor, level); // additive blending multiplies by alpha once
    #include <colorspace_fragment>
  }
`;

/** Every ray path as one batched line object; a bright pulse travels from the speaker along all of them. */
export class RaysObject {
  readonly object: THREE.LineSegments;
  private readonly material: THREE.ShaderMaterial;
  private loopSeconds = 1;
  private epoch = 0; // clock time the current pulse cycle counts from
  private lastSeconds = 0;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uFront: { value: 0 }, uColor: { value: new THREE.Color(RAY_COLOR) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.object = new THREE.LineSegments(new THREE.BufferGeometry(), this.material);
    this.object.frustumCulled = false;
    this.object.name = 'rays';
  }

  setPaths(paths: RayPath[]): void {
    const phase = (this.lastSeconds - this.epoch) % this.loopSeconds;
    const b = buildRayBuffers(paths);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(b.positions, 3));
    geometry.setAttribute('arc', new THREE.BufferAttribute(b.arc, 1));
    geometry.setAttribute('energy', new THREE.BufferAttribute(b.energy, 1));
    geometry.setAttribute('strength', new THREE.BufferAttribute(b.strength, 1));
    this.object.geometry.dispose();
    this.object.geometry = geometry;
    this.loopSeconds = b.maxArc / PULSE_SPEED + PAUSE_SECONDS;
    this.epoch = this.lastSeconds - Math.min(phase, this.loopSeconds);
  }

  /** Advance the pulse; `seconds` is any steadily increasing clock. */
  tick(seconds: number): void {
    this.lastSeconds = seconds;
    this.material.uniforms.uFront.value = ((seconds - this.epoch) % this.loopSeconds) * PULSE_SPEED;
  }

  /** How far the pulse has travelled along every path, in metres. */
  get front(): number {
    return this.material.uniforms.uFront.value as number;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.material.dispose();
  }
}
