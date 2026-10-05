import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RayPath } from '@/lib/acoustics/rays';
import type { DragTarget } from '@/lib/room/placement';
import type { RoomState, Vec3, WallId } from '@/lib/room/types';
import { cameraPreset, type CameraPreset } from './layout';
import {
  buildFixes,
  buildListener,
  buildShell,
  buildSpeaker,
  disposeTree,
  placeListener,
  placeSpeaker,
  type Handle,
} from './objects';
import { RaysObject } from './RaysObject';

export type SceneCallbacks = {
  onDrag: (target: DragTarget, point: Vec3) => void;
  onWallTap: (wall: WallId, point: Vec3) => void;
};

const TAP_SLOP_PX = 6;
const GRAZING = 0.1; // ~6°: below this, pixels map to metres too coarsely to drag
const FORWARD = new THREE.Vector3(0, 0, 1);

/** The 3D room: draws the shell, handles, fixes and rays, and turns pointer input into drags and wall taps. */
export class RoomScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly rays = new RaysObject();
  private readonly speaker = buildSpeaker();
  private readonly listener = buildListener();
  private shell: THREE.Group | null = null;
  private fixes: THREE.Group | null = null;
  private shellKey = '';
  private fixesKey = '';
  private framed = false;
  private placingPanel = false;
  private dragging: { target: DragTarget; plane: THREE.Plane; pointerId: number; offset: { x: number; z: number } } | null = null;
  private down: { x: number; y: number; pointerId: number } | null = null; // the primary press that may become a tap or a drag
  private extraPointer = false; // another finger or button joined the press, so it's a gesture, not a tap

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: SceneCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color(0x0a0a0a);
    this.scene.add(this.speaker, this.listener, this.rays.object);
    // Capture phase: claim a drag before OrbitControls (a bubble-phase listener on the same canvas) starts orbiting.
    canvas.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.renderer.setAnimationLoop((time) => {
      this.controls.update();
      this.rays.tick(time / 1000);
      this.renderer.render(this.scene, this.camera);
    });
  }

  setRoom(room: RoomState): void {
    const shellKey = JSON.stringify([room.dims, room.surfaces]);
    if (shellKey !== this.shellKey) {
      if (this.shell) {
        this.scene.remove(this.shell);
        disposeTree(this.shell);
      }
      this.shell = buildShell(room);
      this.scene.add(this.shell);
      this.shellKey = shellKey;
    }
    const fixesKey = JSON.stringify([room.dims, room.fixes]);
    if (fixesKey !== this.fixesKey) {
      if (this.fixes) {
        this.scene.remove(this.fixes);
        disposeTree(this.fixes);
      }
      this.fixes = buildFixes(room);
      this.scene.add(this.fixes);
      this.fixesKey = fixesKey;
    }
    placeSpeaker(this.speaker, room);
    placeListener(this.listener, room);
    if (!this.framed) {
      this.setCameraPreset(room, 'corner');
      this.framed = true;
    }
  }

  setPaths(paths: RayPath[]): void {
    this.rays.setPaths(paths);
  }

  setRaysVisible(visible: boolean): void {
    this.rays.object.visible = visible;
  }

  setPlacingPanel(placing: boolean): void {
    this.placingPanel = placing;
    this.canvas.style.cursor = placing ? 'crosshair' : '';
  }

  setCameraPreset(room: RoomState, preset: CameraPreset): void {
    // With damping off, update() applies and clears any leftover orbit momentum, so the new view doesn't keep drifting.
    this.controls.enableDamping = false;
    this.controls.update();
    const { position, target } = cameraPreset(room, preset);
    this.camera.position.set(position.x, position.y, position.z);
    this.controls.target.set(target.x, target.y, target.z);
    this.controls.update();
    this.controls.enableDamping = true;
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.controls.dispose();
    for (const object of [this.shell, this.fixes, this.speaker, this.listener]) if (object) disposeTree(object);
    this.rays.dispose();
    this.renderer.dispose();
  }

  private aim(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    // Only a primary-button press by the primary pointer starts a drag or tap; a second finger or another button just cancels a tap.
    if (!event.isPrimary || event.button !== 0) {
      if (this.down) this.extraPointer = true;
      return;
    }
    if (this.dragging) return;
    this.extraPointer = false;
    this.down = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    if (this.placingPanel) return;
    this.aim(event);
    const rugs = this.fixes?.children.filter((c) => (c.userData.handle as Handle).kind === 'rug') ?? [];
    const hit = this.raycaster.intersectObjects([this.speaker, this.listener, ...rugs], true)[0];
    const handle = hit?.object.userData.handle as Handle | undefined;
    if (!hit || !handle || handle.kind === 'panel') return;
    const height = handle.kind === 'speaker' ? this.speaker.position.y : handle.kind === 'listener' ? this.listener.position.y : 0;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -height);
    // Remember where on the item it was grabbed, so the first move doesn't snap its centre to the pointer.
    const item = handle.kind === 'speaker' ? this.speaker.position : handle.kind === 'listener' ? this.listener.position : hit.object.getWorldPosition(new THREE.Vector3());
    const grab = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    const offset = grab ? { x: item.x - grab.x, z: item.z - grab.z } : { x: 0, z: 0 };
    this.dragging = { target: handle, plane, pointerId: event.pointerId, offset };
    this.controls.enabled = false;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.dragging || event.pointerId !== this.dragging.pointerId) return;
    this.aim(event);
    if (Math.abs(this.raycaster.ray.direction.y) < GRAZING) return; // looking along the plane: a few pixels would fling the item
    const point = this.raycaster.ray.intersectPlane(this.dragging.plane, new THREE.Vector3());
    const { offset } = this.dragging;
    if (point) this.callbacks.onDrag(this.dragging.target, { x: point.x + offset.x, y: point.y, z: point.z + offset.z });
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const wasDragging = this.dragging?.pointerId === event.pointerId;
    if (wasDragging) {
      this.dragging = null;
      this.controls.enabled = true;
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    }
    // Only the pointer that owns the press can end it or make it a tap; an extra finger lifting changes nothing.
    const press = this.down;
    if (!press || press.pointerId !== event.pointerId) return;
    const extra = this.extraPointer;
    this.down = null;
    this.extraPointer = false;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (wasDragging || extra || !this.placingPanel || event.type === 'pointercancel' || moved > TAP_SLOP_PX) return;

    // Take the first wall whose inside faces the camera: the one you see, even when looking in from outside.
    this.aim(event);
    const walls = this.shell?.children.filter((c) => String(c.userData.surface ?? '').startsWith('wall')) ?? [];
    const hit = this.raycaster.intersectObjects(walls, false).find((h) => {
      const inward = FORWARD.clone().applyQuaternion(h.object.quaternion);
      return inward.dot(this.raycaster.ray.direction) < 0;
    });
    if (hit) this.callbacks.onWallTap(hit.object.userData.surface as WallId, { x: hit.point.x, y: hit.point.y, z: hit.point.z });
  };
}
