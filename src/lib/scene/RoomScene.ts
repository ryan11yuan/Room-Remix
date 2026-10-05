import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RayPath } from '@/lib/acoustics/rays';
import { applyDrag, type DragTarget } from '@/lib/room/placement';
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
import { advanceWalk, keyDirection, pullInside, walkLook, walkTarget, walkView, WALK_KEYS, WALK_ZOOM, type FloorPoint } from './walk';

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
const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const LISTENER: DragTarget = { kind: 'listener' };

/** Keys typed into a form field are for the field, not for walking. */
function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

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
  private room: RoomState | null = null; // the last room with usable dimensions
  private walk: { goal: FloorPoint | null } | null = null; // walk mode: the floor spot being walked to
  // Walk mode draws, and taps aim, from the orbit camera pulled inside the room. this.camera stays the unpulled orbit
  // camera, so OrbitControls' own event-time updates (wheel and pinch zoom, drag turns) act on it and are kept.
  private readonly drawCamera = new THREE.PerspectiveCamera();
  private midEdit = false; // the store's room has a size being typed: walking waits, or the scene and the store would part ways
  private readonly keys = new Set<string>(); // walk keys held down (KeyboardEvent.code)
  private lastFrame = 0; // ms: the previous frame's time

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
      const dt = (time - this.lastFrame) / 1000; // long gaps (off-screen, a background tab) are capped by walkStep
      this.lastFrame = time;
      if (this.walk) this.stepWalk(this.walk, dt);
      else this.controls.update();
      this.rays.tick(time / 1000);
      this.webgl.render(this.scene, this.walk ? this.drawCamera : this.camera);
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
    if (![length, width, height].every((d) => Number.isFinite(d) && d > 0)) {
      this.midEdit = true; // mid-edit: keep showing the last good room
      return;
    }
    this.midEdit = false;
    this.room = room;
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
      // Re-frame for a new or resized room, unless the user has taken over the camera or walk mode is following the listener.
      if (!this.userMoved && !this.walk) this.setCameraPreset(room, this.preset);
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

  /**
   * Walk mode: the camera rides over the listener's shoulder, and a tap on the floor (or WASD / the arrow keys) walks them.
   * Turning it off leaves the camera where it is. The caller turns walk mode off before choosing another view.
   */
  setWalking(on: boolean): void {
    if (on === (this.walk !== null)) return;
    if (!on) {
      this.walk = null;
      this.keys.clear();
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('blur', this.onBlur);
      this.controls.enablePan = true;
      // The limits go before the update below: it would otherwise clamp a camera pulled in to 0.2 m back out to 0.6 m.
      this.controls.minDistance = 0;
      this.controls.maxDistance = Infinity;
      this.camera.position.copy(this.drawCamera.position);
      this.controls.update(); // stay where walk mode was drawing from
      this.userMoved = true; // the camera stays where the walk left it, so a room-size edit mustn't snap it to a preset
      return;
    }
    if (!this.room) return;
    this.controls.enablePan = false; // the orbit stays centred on the head
    this.controls.minDistance = WALK_ZOOM.min;
    this.controls.maxDistance = WALK_ZOOM.max;
    this.moveCamera(walkView(this.room));
    this.walk = { goal: null };
    this.updateDrawCamera(); // taps before the first frame aim from what is drawn
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  /** One walk-mode frame: step the listener (held keys win over a tapped goal), then carry the camera along inside the room. */
  private stepWalk(walk: { goal: FloorPoint | null }, dt: number): void {
    const room = this.room;
    if (room && this.roomItemsOn && this.tapMode === 'none' && !this.dragging && !this.midEdit) {
      const forward = { x: this.controls.target.x - this.camera.position.x, z: this.controls.target.z - this.camera.position.z };
      const step = advanceWalk(room, walk.goal, keyDirection(this.keys, forward), dt);
      walk.goal = step.goal;
      if (step.to) {
        const point = { x: step.to.x, y: room.listener.y, z: step.to.z };
        this.room = applyDrag(room, LISTENER, point); // ahead of React, so the next frame steps on from here
        placeListener(this.listener, this.room);
        this.callbacks.onDrag(LISTENER, point);
      }
    }
    // Carry the orbit along with the head, then let OrbitControls apply the rest of the user's turn and zoom.
    const head = this.listener.position;
    const look = walkLook(head);
    this.camera.position.sub(this.controls.target).add(look);
    this.controls.target.set(look.x, look.y, look.z);
    this.controls.update();
    this.updateDrawCamera();
  }

  /** Walk mode's view: the orbit camera pulled inside the room, still looking at the point over the head. */
  private updateDrawCamera(): void {
    this.drawCamera.copy(this.camera);
    if (this.room) {
      const inside = pullInside(this.room.dims, this.listener.position, this.camera.position);
      this.drawCamera.position.set(inside.x, inside.y, inside.z);
      this.drawCamera.lookAt(this.controls.target);
    }
    this.drawCamera.updateMatrixWorld();
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    // Scrolled off-screen, the arrow keys scroll the page again instead of walking.
    if (!this.onScreen || !WALK_KEYS.has(event.code) || event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return;
    this.keys.add(event.code);
    event.preventDefault(); // the arrow keys mustn't scroll the page while walking
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  /** A key let go while another window had focus never sends keyup. */
  private readonly onBlur = () => {
    this.keys.clear();
  };

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
    this.setWalking(false); // removes the window key listeners
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
    this.raycaster.setFromCamera(ndc, this.walk ? this.drawCamera : this.camera);
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
    // In walk mode the camera rides on the listener's head, so dragging the listener would chase itself: tap the floor instead.
    const grabbable = this.walk ? [this.speaker, ...rugs] : [this.speaker, this.listener, ...rugs];
    const hit = this.raycaster.intersectObjects(grabbable, true)[0];
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
    if (wasDragging || extra || event.type === 'pointercancel' || moved > TAP_SLOP_PX) return;

    this.aim(event);
    if (this.tapMode === 'none') {
      // Walk mode: walk to where the tap meets the floor. A tap above the horizon never meets it.
      if (!this.walk || !this.room || !this.roomItemsOn) return;
      const floor = this.raycaster.ray.intersectPlane(FLOOR, new THREE.Vector3());
      const goal = floor && walkTarget(this.room, { x: floor.x, z: floor.z });
      if (goal) this.walk.goal = goal;
      return;
    }
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
