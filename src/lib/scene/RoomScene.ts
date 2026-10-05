import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RayPath } from '@/lib/acoustics/rays';
import type { DragTarget } from '@/lib/room/placement';
import type { RoomState, Vec3, WallId } from '@/lib/room/types';
import { boxView, cameraPreset, type CameraPreset } from './layout';
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

/** What a tap on the canvas does: nothing, place a panel on a wall, or pick a point on the room scan. */
export type TapMode = 'none' | 'panel' | 'scan';
/** How the room's own walls are drawn: tinted surfaces and a grid, just the edges, or not at all. */
export type ShellStyle = 'tinted' | 'outline' | 'hidden';

export type SceneCallbacks = {
  onDrag: (target: DragTarget, point: Vec3) => void;
  onWallTap: (wall: WallId, point: Vec3) => void;
  /** Scan mode: where a tap first hit a scan target. */
  onScanTap: (point: Vec3) => void;
};

const TAP_SLOP_PX = 6;
const GRAZING = 0.1; // ~6°: below this, pixels map to metres too coarsely to drag
const FORWARD = new THREE.Vector3(0, 0, 1);

/** The 3D room: draws the shell, handles, fixes and rays, and turns pointer input into drags, wall taps and scan taps. */
export class RoomScene {
  private readonly webgl: THREE.WebGLRenderer;
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
  private preset: CameraPreset = 'corner';
  private dimsKey = '';
  private userMoved = false; // the user has orbited or zoomed since the last preset, so a resized room mustn't yank the camera
  private shellStyle: ShellStyle = 'tinted';
  private raysOn = true; // the rays toggle; rays show only when the room items are also on
  private roomItemsOn = true; // speaker, listener, fixes and rays
  private tapMode: TapMode = 'none';
  private scanTargets: THREE.Object3D[] = [];
  private onScreen = true; // the canvas is in view; when it isn't, the loop skips updating and drawing
  private readonly visibility: IntersectionObserver;
  private dragging: { target: DragTarget; plane: THREE.Plane; pointerId: number; offset: { x: number; z: number } } | null = null;
  private down: { x: number; y: number; pointerId: number } | null = null; // the primary press that may become a tap or a drag
  private extraPointer = false; // another finger or button joined the press, so it's a gesture, not a tap

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: SceneCallbacks,
  ) {
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color(0x0a0a0a);
    this.scene.add(this.speaker, this.listener, this.rays.object);
    // Capture phase: claim a drag before OrbitControls (a bubble-phase listener on the same canvas) starts orbiting.
    canvas.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.addEventListener('start', () => {
      this.userMoved = true; // 'start' fires only on user interaction
    });
    // Entries arrive oldest first, so the last one is the canvas's current state.
    this.visibility = new IntersectionObserver((entries) => {
      for (const entry of entries) this.onScreen = entry.isIntersecting;
    });
    this.visibility.observe(canvas);
    this.webgl.setAnimationLoop((time) => {
      if (!this.onScreen) return; // scrolled out of view: don't spend the GPU on a canvas nobody can see
      this.controls.update();
      this.rays.tick(time / 1000);
      this.webgl.render(this.scene, this.camera);
    });
  }

  /** The WebGL renderer, so another layer (such as a splat renderer) can draw into the same context. */
  get renderer(): THREE.WebGLRenderer {
    return this.webgl;
  }

  /** Add an extra object (such as a room scan) to the scene. The caller owns it and disposes it. */
  addLayer(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  removeLayer(object: THREE.Object3D): void {
    this.scene.remove(object);
  }

  setRoom(room: RoomState): void {
    const { length, width, height } = room.dims;
    if (![length, width, height].every((d) => Number.isFinite(d) && d > 0)) return; // mid-edit: keep showing the last good room
    const shellKey = JSON.stringify([room.dims, room.surfaces]);
    if (shellKey !== this.shellKey) {
      if (this.shell) {
        this.scene.remove(this.shell);
        disposeTree(this.shell);
      }
      this.shell = buildShell(room);
      this.scene.add(this.shell);
      this.applyShellStyle();
      this.shellKey = shellKey;
    }
    const fixesKey = JSON.stringify([room.dims, room.fixes]);
    if (fixesKey !== this.fixesKey) {
      if (this.fixes) {
        this.scene.remove(this.fixes);
        disposeTree(this.fixes);
      }
      this.fixes = buildFixes(room);
      this.fixes.visible = this.roomItemsOn;
      this.scene.add(this.fixes);
      this.fixesKey = fixesKey;
    }
    placeSpeaker(this.speaker, room);
    placeListener(this.listener, room);
    const dimsKey = JSON.stringify(room.dims);
    if (dimsKey !== this.dimsKey) {
      this.dimsKey = dimsKey;
      if (!this.userMoved) this.setCameraPreset(room, this.preset); // re-frame for a new or resized room unless the user has taken over the camera
    }
  }

  setPaths(paths: RayPath[]): void {
    this.rays.setPaths(paths);
  }

  setRaysVisible(visible: boolean): void {
    this.raysOn = visible;
    this.rays.object.visible = this.raysOn && this.roomItemsOn;
  }

  /** Show or hide the speaker, listener, fixes and rays together (rays also need their own toggle on). */
  setRoomItemsVisible(visible: boolean): void {
    this.roomItemsOn = visible;
    this.speaker.visible = visible;
    this.listener.visible = visible;
    if (this.fixes) this.fixes.visible = visible;
    this.rays.object.visible = this.raysOn && visible;
  }

  setShellStyle(style: ShellStyle): void {
    this.shellStyle = style;
    this.applyShellStyle();
  }

  /** Wall meshes that are switched off still raycast, so panel taps keep working in the outline and hidden styles. */
  private applyShellStyle(): void {
    if (!this.shell) return;
    const style = this.shellStyle;
    for (const child of this.shell.children) {
      if (child.userData.surface) child.visible = style === 'tinted';
      else if (child.name === 'edges') child.visible = style !== 'hidden';
      else if (child.name === 'grid') child.visible = style === 'tinted';
    }
  }

  setTapMode(mode: TapMode): void {
    this.tapMode = mode;
    this.canvas.style.cursor = mode === 'none' ? '' : 'crosshair';
  }

  /** The objects a tap hits in scan mode (searched recursively). */
  setScanTargets(objects: THREE.Object3D[]): void {
    this.scanTargets = objects;
  }

  setCameraPreset(room: RoomState, preset: CameraPreset): void {
    this.preset = preset;
    this.moveCamera(cameraPreset(room, preset));
  }

  /** Look at a box (such as a scan's bounds) from outside it. */
  frameBox(min: Vec3, max: Vec3): void {
    if (![min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite)) return; // an empty box has infinite corners: stay put
    this.moveCamera(boxView(min, max));
    this.userMoved = true; // the scan view isn't a room preset: a room-size edit mustn't snap back to one
  }

  private moveCamera({ position, target }: { position: Vec3; target: Vec3 }): void {
    this.userMoved = false; // choosing a view hands framing back to the app
    // With damping off, update() applies and clears any leftover orbit momentum, so the new view doesn't keep drifting.
    this.controls.enableDamping = false;
    this.controls.update();
    this.camera.position.set(position.x, position.y, position.z);
    this.controls.target.set(target.x, target.y, target.z);
    this.controls.update();
    this.controls.enableDamping = true;
  }

  resize(width: number, height: number): void {
    this.webgl.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.webgl.setAnimationLoop(null);
    this.visibility.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.controls.dispose();
    for (const object of [this.shell, this.fixes, this.speaker, this.listener]) if (object) disposeTree(object);
    this.rays.dispose();
    this.webgl.dispose();
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
    // A tap mode owns the press; hidden room items can't be grabbed (the raycaster doesn't check `visible`).
    if (this.tapMode !== 'none' || !this.roomItemsOn) return;
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
    if (wasDragging || extra || this.tapMode === 'none' || event.type === 'pointercancel' || moved > TAP_SLOP_PX) return;

    this.aim(event);
    if (this.tapMode === 'scan') {
      const scanHit = this.raycaster.intersectObjects(this.scanTargets, true)[0];
      if (scanHit) this.callbacks.onScanTap({ x: scanHit.point.x, y: scanHit.point.y, z: scanHit.point.z });
      return;
    }

    // Take the first wall whose inside faces the camera: the one you see, even when looking in from outside.
    const walls = this.shell?.children.filter((c) => String(c.userData.surface ?? '').startsWith('wall')) ?? [];
    const hit = this.raycaster.intersectObjects(walls, false).find((h) => {
      const inward = FORWARD.clone().applyQuaternion(h.object.quaternion);
      return inward.dot(this.raycaster.ray.direction) < 0;
    });
    if (hit) this.callbacks.onWallTap(hit.object.userData.surface as WallId, { x: hit.point.x, y: hit.point.y, z: hit.point.z });
  };
}
