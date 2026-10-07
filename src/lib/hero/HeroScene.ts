import * as THREE from 'three';
import { IDENTITY_ALIGNMENT } from '@/lib/scene/alignment';
// Never a value import of SplatLayer here: it would pull Spark into this bundle (eslint enforces). open() uses import().
import type { SplatLayer } from '@/lib/scene/SplatLayer';
import type { CameraPose } from '@/lib/splatJobs/protocol';
import { fallbackView, viewFromCameras } from '@/lib/viewer/view';

const BACKGROUND = 0x100904; // walnut, so the room's edges fall away into the page
const DEG = Math.PI / 180;
const SWAY = 4.5 * DEG; // the idle turn either side, like an object on a slow turntable
const SWAY_PERIOD_S = 24;
export const SCROLL_TURN = 26 * DEG; // scrolling from the hero to the next section walks the camera this far round the room
const SCROLL_DOLLY = 0.14; // and this much closer
const POINTER_TURN = 2.5 * DEG;
const POINTER_TILT = 1.5 * DEG;
const PIVOT_SHARE = 0.3; // the turn's centre sits this share of the room's diagonal in front of the video's first camera
const EASE_PER_S = 3.5; // how quickly the camera catches up with scroll and pointer
const VIDEO_ASPECT = 16 / 9; // phone video filmed sideways; a narrower screen keeps the video's width of view
const MAX_FOV = 90;

/** How far round the pivot the camera has turned: the idle sway at `seconds`, plus scroll (0..1) and the pointer (-1..1). */
export function turnAt(seconds: number, progress: number, pointerX: number, still: boolean): number {
  if (still) return 0;
  return SWAY * Math.sin((2 * Math.PI * seconds) / SWAY_PERIOD_S) + SCROLL_TURN * progress + POINTER_TURN * pointerX;
}

/** Where the camera stands: `offset` from the pivot, turned about the vertical and brought `dolly` of the way in. */
export function orbit(pivot: THREE.Vector3, offset: THREE.Vector3, turn: number, dolly: number): THREE.Vector3 {
  return offset.clone().multiplyScalar(dolly).applyAxisAngle(THREE.Object3D.DEFAULT_UP, turn).add(pivot);
}

/**
 * The home page's room (spec: DESIGN.md, the hero). The newest room seen from where its video began, turning slowly
 * round a point in front of the camera; scroll and the pointer add to the turn. No controls: it's a picture, not the viewer.
 */
export class HeroScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.01, 1000);
  private layer: SplatLayer | null = null;
  private pivot: THREE.Vector3 | null = null;
  private offset = new THREE.Vector3(); // camera position minus pivot, at turn 0
  private videoFov = 60; // the video camera's vertical field of view, degrees
  private target = { progress: 0, x: 0, y: 0 };
  private eased = { progress: 0, x: 0, y: 0 };
  private running = true;
  private frame = 0;
  private last = 0;
  private started = 0;
  private disposed = false;

  /** `still`: the visitor asked for reduced motion, so the room holds the video's first view. */
  constructor(
    canvas: HTMLCanvasElement,
    private readonly still: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.scene.background = new THREE.Color(BACKGROUND);
    this.frame = requestAnimationFrame(this.tick);
  }

  async open(bytes: ArrayBuffer, cameras: CameraPose[] | null): Promise<void> {
    const { SplatLayer } = await import('@/lib/scene/SplatLayer');
    if (this.disposed) return;
    const layer = new SplatLayer(this.renderer);
    let info: Awaited<ReturnType<SplatLayer['load']>>;
    try {
      info = await layer.load(bytes, 'splat.spz');
    } catch (error) {
      layer.dispose();
      throw error;
    }
    if (this.disposed) {
      layer.dispose();
      return;
    }
    const view = (cameras && viewFromCameras(cameras)) ?? fallbackView(info);
    const q = view.rotation;
    layer.setAlignment({ ...IDENTITY_ALIGNMENT, level: [q.x, q.y, q.z, q.w] });
    this.scene.add(layer.group);
    this.layer = layer;
    const size = view.speed * 4; // the room's diagonal, as the viewer works it out
    this.camera.near = Math.max(size / 10_000, 0.001);
    this.camera.far = Math.max(size * 100, 10);
    if (view.fov !== undefined) this.videoFov = view.fov;
    this.fitFov();
    this.pivot = view.position.clone().addScaledVector(view.forward, size * PIVOT_SHARE);
    this.offset = view.position.clone().sub(this.pivot);
    this.started = performance.now();
    this.place(0);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.fitFov();
  }

  /** On a screen narrower than the video (a phone held upright), widen the view so the room's width still fits. */
  private fitFov(): void {
    const across = 2 * Math.atan(Math.tan((this.videoFov * DEG) / 2) * VIDEO_ASPECT);
    const upright = (2 * Math.atan(Math.tan(across / 2) / this.camera.aspect)) / DEG;
    this.camera.fov = Math.min(MAX_FOV, Math.max(this.videoFov, upright));
    this.camera.updateProjectionMatrix();
  }

  /** 0 with the hero in view, 1 once the next section has scrolled over it. */
  setProgress(progress: number): void {
    this.target.progress = Math.min(1, Math.max(0, progress));
  }

  /** The pointer across the window, -1..1 each way. */
  setPointer(x: number, y: number): void {
    this.target.x = x;
    this.target.y = y;
  }

  /** Stop drawing while the hero is off screen. */
  setRunning(running: boolean): void {
    if (this.disposed || running === this.running) return;
    this.running = running;
    cancelAnimationFrame(this.frame);
    if (running) {
      this.last = 0;
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.layer?.dispose();
    this.renderer.dispose();
  }

  private place(seconds: number): void {
    if (!this.pivot) return;
    const k = 1 - Math.exp(-EASE_PER_S * seconds);
    for (const key of ['progress', 'x', 'y'] as const) this.eased[key] += (this.target[key] - this.eased[key]) * k;
    const turn = turnAt((performance.now() - this.started) / 1000, this.eased.progress, this.eased.x, this.still);
    const dolly = this.still ? 1 : 1 - SCROLL_DOLLY * this.eased.progress;
    this.camera.position.copy(orbit(this.pivot, this.offset, turn, dolly));
    const look = this.pivot.clone();
    if (!this.still) look.y -= Math.tan(POINTER_TILT * this.eased.y) * this.offset.length();
    this.camera.lookAt(look);
  }

  private readonly tick = (now: number) => {
    if (this.disposed || !this.running) return;
    const seconds = this.last ? Math.min((now - this.last) / 1000, 0.1) : 0;
    this.last = now;
    this.place(seconds);
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.tick);
  };
}
