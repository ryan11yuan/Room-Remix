import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { IDENTITY_ALIGNMENT } from '@/lib/scene/alignment';
// Never a value import of SplatLayer here: it would pull Spark into this bundle (eslint enforces). open() uses import().
import type { SplatLayer } from '@/lib/scene/SplatLayer';
import type { CameraPose } from '@/lib/splatJobs/protocol';
import { anglesOf, lookDirection, MOVE_KEYS, moveStep, turn, type Angles } from './controls';
import { floorPoint } from './floorPoint';
import { fallbackView, viewFromCameras, type StartView } from './view';

const BACKGROUND = 0x100904; // walnut, the page's canvas colour (DESIGN.md)
const CLICK_SLOP_PX = 5; // a press that moved further than this was a drag (spin), not a click (look around)

/** The splat viewer (spec 2026-10-07 §4), Memento-style: spin and zoom, W/A/S/D and Q/E, click to look around. Browser only. */
export class ViewerScene {
  /** Things drawn in the room (speaker, heat map, labels), in world coordinates. */
  readonly overlay = new THREE.Group();
  /** Called every frame before rendering (the sound follows the camera). */
  onFrame: (() => void) | null = null;
  private readonly labels = new CSS2DRenderer();
  private placing: { floorY: number; onPlace: (world: THREE.Vector3) => void } | null = null;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.01, 1000);
  private readonly controls: OrbitControls;
  private readonly keys = new Set<string>();
  private layer: SplatLayer | null = null;
  private view: StartView | null = null;
  private angles: Angles = { yaw: 0, pitch: 0 };
  private targetDistance = 1;
  private pressedAt: { x: number; y: number } | null = null;
  private frame = 0;
  private last = 0;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color(BACKGROUND);
    this.scene.add(this.overlay);
    const el = this.labels.domElement;
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '0'; // its own stacking context: label z-indexes stay below the chrome
    canvas.after(el);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    canvas.addEventListener('pointerdown', this.press);
    canvas.addEventListener('click', this.click);
    document.addEventListener('pointerlockchange', this.lockChanged);
    document.addEventListener('mousemove', this.look);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.releaseKeys);
    this.frame = requestAnimationFrame(this.tick);
  }

  get startView(): StartView | null {
    return this.view;
  }

  /** The splat's centres in its own (raw) frame; empty before a room is open. */
  get splatCentres(): Float32Array {
    return this.layer?.centres() ?? new Float32Array(0);
  }

  pose(): { position: THREE.Vector3; forward: THREE.Vector3 } {
    return { position: this.camera.position.clone(), forward: this.camera.getWorldDirection(new THREE.Vector3()) };
  }

  /** The next click on the floor calls `onPlace` with where it landed, instead of locking the pointer (spec §5). */
  armPlacement(floorY: number, onPlace: (world: THREE.Vector3) => void): void {
    this.placing = { floorY, onPlace };
    if (this.locked) document.exitPointerLock();
    this.canvas.style.cursor = 'crosshair';
  }

  /** Show a room: its splat, turned upright and seen from where the video began (or Memento's view without cameras). */
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
    layer.setAlignment({ ...IDENTITY_ALIGNMENT, level: [q.x, q.y, q.z, q.w] }); // turns the splat only, not Spark's renderer
    this.scene.add(layer.group);
    this.layer = layer;
    this.view = view;
    const size = view.speed * 4; // the diagonal the speed came from
    this.camera.near = Math.max(size / 10_000, 0.001);
    this.camera.far = Math.max(size * 100, 10);
    if (view.fov !== undefined) this.camera.fov = view.fov; // match the video's field of view
    this.camera.updateProjectionMatrix();
    this.targetDistance = Math.max(size * 0.1, 0.05);
    this.camera.position.copy(view.position);
    this.controls.target.copy(view.position).addScaledVector(view.forward, this.targetDistance);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.labels.setSize(width, height);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.onFrame = null;
    this.labels.domElement.remove();
    cancelAnimationFrame(this.frame);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.canvas.removeEventListener('pointerdown', this.press);
    this.canvas.removeEventListener('click', this.click);
    document.removeEventListener('pointerlockchange', this.lockChanged);
    document.removeEventListener('mousemove', this.look);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.releaseKeys);
    this.controls.dispose();
    this.layer?.dispose();
    this.renderer.dispose();
  }

  private get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  private readonly press = (event: PointerEvent) => {
    this.pressedAt = { x: event.clientX, y: event.clientY };
  };

  /** A click (not the end of a spin drag) locks the pointer for looking around; Esc releases it (the browser's). */
  private readonly click = (event: MouseEvent) => {
    const from = this.pressedAt;
    this.pressedAt = null;
    if (this.placing && from && Math.hypot(event.clientX - from.x, event.clientY - from.y) <= CLICK_SLOP_PX) {
      const rect = this.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, this.camera);
      const hit = floorPoint(raycaster.ray, this.placing.floorY);
      if (hit) {
        const { onPlace } = this.placing;
        this.placing = null;
        this.canvas.style.cursor = '';
        onPlace(hit);
      }
      return;
    }
    if (!this.view || this.locked || !from) return;
    if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > CLICK_SLOP_PX) return;
    // Chrome rejects a re-lock right after Esc; stay in spin mode quietly and let the next click try again.
    Promise.resolve(this.canvas.requestPointerLock?.()).catch(() => {});
  };

  private readonly lockChanged = () => {
    const locked = this.locked;
    this.controls.enabled = !locked; // no spinning while looking around
    if (locked) {
      this.angles = anglesOf(this.camera.getWorldDirection(new THREE.Vector3()));
      this.targetDistance = this.camera.position.distanceTo(this.controls.target) || this.targetDistance;
    }
  };

  private readonly look = (event: MouseEvent) => {
    if (!this.locked) return;
    this.angles = turn(this.angles, event.movementX, event.movementY);
    const direction = lookDirection(this.angles.yaw, this.angles.pitch);
    this.controls.target.copy(this.camera.position).addScaledVector(direction, this.targetDistance);
    this.camera.lookAt(this.controls.target);
  };

  private readonly keyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!(event.code in MOVE_KEYS) && event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') return;
    this.keys.add(event.code);
    event.preventDefault();
  };

  private readonly keyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  /** Alt-tab with a key held never sends its keyup: stop instead of drifting forever. */
  private readonly releaseKeys = () => {
    this.keys.clear();
  };

  private readonly tick = (now: number) => {
    if (this.disposed) return;
    const seconds = this.last ? (now - this.last) / 1000 : 0;
    this.last = now;
    if (this.view && this.keys.size > 0) {
      const yaw = this.locked ? this.angles.yaw : anglesOf(this.camera.getWorldDirection(new THREE.Vector3())).yaw;
      const step = moveStep(this.keys, yaw, this.view.speed, seconds);
      this.camera.position.add(step);
      this.controls.target.add(step); // move the spin point with you, like Memento
    }
    if (this.controls.enabled) this.controls.update();
    this.onFrame?.();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.tick);
  };
}
