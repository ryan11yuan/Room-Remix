import * as THREE from 'three';
import { createNarrator } from '@/lib/audio/narrator';
import { SpatialAudio } from '@/lib/audio/spatial';
import { pulseInterval } from '@/lib/explore/beacon';
import { addObject, removeObject, renameObject, sortObjects } from '@/lib/explore/checked';
import { createRepeater } from '@/lib/explore/keys';
import { CLIPS, type NameId } from '@/lib/explore/names';
import type { ScanItem } from '@/lib/explore/scan';
import { act, earPosition, pulseTarget, startSession, type Action, type Effect, type Session } from '@/lib/explore/session';
import type { Dims, RoomObject, Vec3 } from '@/lib/room/types';
import { placeObjects } from '@/lib/sound/placeObjects';
import { fitRoom, roomYaw, toRoom, toWorld } from '@/lib/sound/roomFit';
import type { RoomFit } from '@/lib/sound/types';
import { fetchChecked, fetchDetections, saveChecked } from '@/lib/splatJobs/client';
import type { CameraPose } from '@/lib/splatJobs/protocol';
import { LabelsOverlay } from './LabelsOverlay';
import type { ViewerScene } from './ViewerScene';

export const SCAN_GAP_MS = 250; // between scan clips (spec §7.4)

export type ExploreState = {
  dims: Dims;
  objects: 'finding' | RoomObject[];
  findFailed: boolean;
  adding: boolean;
  saveFailed: boolean;
  highlight: number | null;
  mode: 'check' | 'starting' | 'exploring';
  voicesFailed: boolean;
  caption: string;
  /** The row whose name select should take focus: a just-added or just-renamed object. */
  focus: number | null;
};

const vec = (v: THREE.Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

/** Check mode and explore mode in the splat viewer (spec 2026-10-08 §6–9). Browser only; decisions live in lib/explore. */
export class ExploreController {
  private state: ExploreState;
  private readonly listeners = new Set<() => void>();
  private readonly overlay: LabelsOverlay;
  private readonly narrator = createNarrator(
    typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis,
    (text) => new SpeechSynthesisUtterance(text),
  );
  private readonly repeater = createRepeater((action) => this.perform(action));
  private audio: SpatialAudio | null = null;
  private session: Session | null = null;
  private runToken = 0; // a newer action's sounds replace an older one's that are still queued
  private scanToken = 0; // a new scan replaces the one playing
  private lastPulse = 0;
  private disposed = false;

  /** Null without a cameras file or splat points: no scale, so no room box (spec §12). */
  static create(scene: ViewerScene, roomId: string, cameras: CameraPose[] | null): ExploreController | null {
    const view = scene.startView;
    const raw = scene.splatCentres;
    if (!view || !cameras?.length || raw.length === 0) return null;
    const q = view.rotation;
    const upright = new Float32Array(raw.length);
    const v = new THREE.Vector3();
    for (let i = 0; i < raw.length; i += 3) {
      v.set(raw[i], raw[i + 1], raw[i + 2]).applyQuaternion(q);
      [upright[i], upright[i + 1], upright[i + 2]] = [v.x, v.y, v.z];
    }
    const fit = fitRoom(upright, cameras.map((c) => vec(new THREE.Vector3(...c.position).applyQuaternion(q))));
    return new ExploreController(scene, roomId, cameras, raw, q, fit);
  }

  private constructor(
    private readonly scene: ViewerScene,
    private readonly roomId: string,
    cameras: CameraPose[],
    raw: Float32Array,
    rotation: THREE.Quaternion,
    private readonly fit: RoomFit,
  ) {
    this.overlay = new LabelsOverlay(fit);
    scene.overlay.add(this.overlay.root);
    this.state = {
      dims: fit.dims,
      objects: 'finding',
      findFailed: false,
      adding: false,
      saveFailed: false,
      highlight: null,
      mode: 'check',
      voicesFailed: false,
      caption: '',
      focus: null,
    };
    scene.onFrame = this.frame;
    void this.load(cameras, raw, rotation);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getState = (): ExploreState => this.state;

  // ── Check mode (spec §6) ──

  rename(index: number, label: NameId): void {
    if (this.state.mode !== 'check') return;
    const r = renameObject(this.objects, index, label);
    this.setObjects(r.objects, true);
    this.set({ focus: r.index });
  }

  remove(index: number): void {
    if (this.state.mode !== 'check') return;
    this.setObjects(removeObject(this.objects, index), true);
    this.set({ focus: null });
  }

  add(): void {
    if (this.state.mode !== 'check' || this.state.objects === 'finding') return;
    this.set({ adding: true });
    this.scene.armPlacement(this.fit.floorY, (world) => {
      if (this.disposed || this.state.mode !== 'check') return;
      const at = toRoom(this.fit, vec(world));
      const r = addObject(this.objects, 'door', at);
      this.setObjects(r.objects, true);
      this.set({ adding: false, focus: r.index });
    });
  }

  setHighlight(index: number | null): void {
    if (this.state.mode !== 'check') return;
    this.overlay.setHighlight(index);
    this.set({ highlight: index });
  }

  // ── Explore mode (spec §7–8) ──

  async startExploring(): Promise<void> {
    if (this.state.mode !== 'check' || this.state.objects === 'finding') return;
    (document.activeElement as HTMLElement | null)?.blur?.(); // Space or Enter must not click a focused button
    this.set({ mode: 'starting', voicesFailed: false, adding: false });
    let audio: SpatialAudio;
    try {
      audio = await SpatialAudio.create(this.fit.dims, CLIPS.keys()); // its AudioContext starts inside this click
    } catch (error) {
      console.error(error);
      return this.set({ mode: 'check', voicesFailed: true });
    }
    const view = this.scene.startView;
    if (this.disposed || this.getState().mode !== 'starting' || !view) return audio.dispose();
    this.audio = audio;
    const p = toRoom(this.fit, vec(view.position));
    const start = startSession(this.fit.dims, this.objects, { x: p.x, z: p.z, heading: roomYaw(this.fit, vec(view.forward)) });
    this.session = start.session;
    this.lastPulse = 0;
    this.scene.setExploring(true);
    this.overlay.setHighlight(null);
    this.followPose();
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.releaseKeys);
    this.set({ mode: 'exploring', caption: '', highlight: null });
    void this.run(start.effects, ++this.runToken);
  }

  stopExploring(): void {
    if (this.state.mode !== 'exploring') return;
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.releaseKeys);
    this.repeater.releaseAll();
    this.runToken++;
    this.scanToken++;
    this.narrator.stop();
    this.audio?.dispose();
    this.audio = null;
    this.session = null;
    this.scene.setExploring(false);
    this.overlay.setHighlight(null);
    this.set({ mode: 'check', caption: '' });
  }

  dispose(): void {
    if (this.disposed) return;
    this.stopExploring();
    this.disposed = true;
    if (this.scene.onFrame === this.frame) this.scene.onFrame = null;
    this.audio?.dispose();
    this.overlay.dispose();
    this.listeners.clear();
  }

  private get objects(): RoomObject[] {
    return Array.isArray(this.state.objects) ? this.state.objects : [];
  }

  /** The checked list if the helper saved one; otherwise the objects found in the video (spec §6). */
  private async load(cameras: CameraPose[], raw: Float32Array, rotation: THREE.Quaternion): Promise<void> {
    const checked = await fetchChecked(this.roomId);
    if (this.disposed) return;
    if (checked) return this.setObjects(sortObjects(checked), false);
    const file = await fetchDetections(this.roomId);
    if (this.disposed) return;
    if (!file) {
      this.set({ findFailed: true });
      return this.setObjects([], false);
    }
    const toRoomPoint = (x: number, y: number, z: number) => toRoom(this.fit, vec(new THREE.Vector3(x, y, z).applyQuaternion(rotation)));
    this.setObjects(sortObjects(placeObjects(file, cameras, raw, toRoomPoint, this.fit.scale)), false);
  }

  private setObjects(objects: RoomObject[], save: boolean): void {
    this.overlay.setObjects(objects);
    this.set({ objects, highlight: null });
    if (save) void saveChecked(this.roomId, objects).then((ok) => this.set({ saveFailed: !ok }));
  }

  private readonly keyDown = (event: KeyboardEvent) => {
    if (this.repeater.press(event)) event.preventDefault();
  };

  private readonly keyUp = (event: KeyboardEvent) => {
    this.repeater.release(event.code);
  };

  private readonly releaseKeys = () => {
    this.repeater.releaseAll();
  };

  private perform(action: Action): void {
    if (!this.session) return;
    const { session, effects } = act(this.session, action);
    const moved = session.pose !== this.session.pose;
    this.session = session;
    if (moved) this.followPose();
    this.overlay.setHighlight(session.chosen);
    if (effects.length > 0) void this.run(effects, ++this.runToken);
  }

  /** Effects in order: a clip or thud finishes before what follows it (a bump's name, a target's line). */
  private async run(effects: Effect[], token: number): Promise<void> {
    for (const e of effects) {
      const audio = this.audio;
      if (!audio || token !== this.runToken) return;
      if (e.kind === 'say') {
        this.narrator.say(e.text);
        this.set({ caption: e.text });
      } else if (e.kind === 'clip') await audio.playClip(e.clip, e.at);
      else if (e.kind === 'thud') await audio.playThud(e.at);
      else if (e.kind === 'footstep') void audio.playFootstep();
      else if (e.kind === 'chime') void audio.playChime();
      else void this.playScan(e.items);
    }
  }

  /** Each scan name from its place, 0.25 s apart, added to the caption as it plays; moving doesn't stop it. */
  private async playScan(items: ScanItem[]): Promise<void> {
    const token = ++this.scanToken;
    const said: string[] = [];
    for (const item of items) {
      if (token !== this.scanToken || !this.audio) return;
      said.push(item.caption);
      this.set({ caption: said.join(' · ') });
      await this.audio.playClip(item.clip, item.at);
      await new Promise((resolve) => setTimeout(resolve, SCAN_GAP_MS));
    }
  }

  /** The camera and the ears follow the explorer: room metres → world, heading → a world direction. */
  private followPose(): void {
    if (!this.session) return;
    const ear = earPosition(this.session);
    const world = toWorld(this.fit, ear);
    const h = this.session.pose.heading + this.fit.yaw; // a room direction (cos θ, sin θ) is (cos(θ + yaw), sin(θ + yaw)) in world
    this.scene.setPose(new THREE.Vector3(world.x, world.y, world.z), new THREE.Vector3(Math.cos(h), 0, Math.sin(h)));
    this.audio?.setListener(ear, this.session.pose.heading);
  }

  /** Every frame while going somewhere: the pulse, faster as you close in (spec §7.5). */
  private readonly frame = (): void => {
    if (!this.session || !this.audio) return;
    const target = pulseTarget(this.session);
    if (!target) return;
    const now = performance.now() / 1000;
    if (now - this.lastPulse < pulseInterval(target.distance)) return;
    this.lastPulse = now;
    void this.audio.playPulse(target.at);
  };

  private set(patch: Partial<ExploreState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }
}
