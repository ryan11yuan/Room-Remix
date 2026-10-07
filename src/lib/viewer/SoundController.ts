import * as THREE from 'three';
import { predictRt60 } from '@/lib/acoustics/simulate';
import { synthClip, type DemoClipId } from '@/lib/audio/demoClips';
import { AudioEngine } from '@/lib/audio/engine';
import { silentIr } from '@/lib/audio/mix';
import type { Dims, RoomObject, Vec3 } from '@/lib/room/types';
import { scoreSpeakerAt } from '@/lib/sound/bestSpot';
import { SoundClient } from '@/lib/sound/client';
import { placeObjects } from '@/lib/sound/placeObjects';
import { fitRoom, roomYaw, toRoom } from '@/lib/sound/roomFit';
import { clampSpeaker, placeListener, soundRoom } from '@/lib/sound/soundRoom';
import type { RoomFit, SpotMap } from '@/lib/sound/types';
import { fetchDetections } from '@/lib/splatJobs/client';
import type { CameraPose } from '@/lib/splatJobs/protocol';
import { SoundOverlay } from './SoundOverlay';
import type { ViewerScene } from './ViewerScene';

export const MOVE_TO_RENDER = 0.25; // m (spec §7)
export const TURN_TO_RENDER = (15 * Math.PI) / 180;

export type SoundState = {
  dims: Dims;
  rt60: number;
  objects: 'finding' | 'failed' | RoomObject[];
  speaker: Vec3 | null;
  placing: boolean;
  spots: 'idle' | 'finding' | 'failed' | SpotMap;
  speakerScore: number | null;
  playing: boolean;
  clip: DemoClipId;
};

const vec = (v: THREE.Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

/** Sound in the splat viewer (spec 2026-10-07 sound): objects, the speaker, the best spot and walking audio. Browser only. */
export class SoundController {
  private state: SoundState;
  private readonly listeners = new Set<() => void>();
  private readonly overlay: SoundOverlay;
  private readonly client = new SoundClient();
  private engine: AudioEngine | null = null;
  private clipLoaded: DemoClipId | null = null;
  private lastRender: { position: Vec3; yaw: number } | null = null;
  private rendering = false;
  private disposed = false;

  /** Null without a cameras file: no scale, so no sound (spec §2). */
  static create(scene: ViewerScene, roomId: string, cameras: CameraPose[] | null): SoundController | null {
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
    return new SoundController(scene, roomId, cameras, raw, q, fit);
  }

  private constructor(
    private readonly scene: ViewerScene,
    roomId: string,
    cameras: CameraPose[],
    raw: Float32Array,
    rotation: THREE.Quaternion,
    private readonly fit: RoomFit,
  ) {
    this.overlay = new SoundOverlay(fit);
    scene.overlay.add(this.overlay.root);
    this.state = {
      dims: fit.dims,
      rt60: this.rt60([]),
      objects: 'finding',
      speaker: null,
      placing: false,
      spots: 'idle',
      speakerScore: null,
      playing: false,
      clip: 'drums',
    };
    scene.onFrame = this.frame;
    void fetchDetections(roomId).then((file) => {
      if (this.disposed) return;
      if (!file) return this.set({ objects: 'failed' });
      const toRoomPoint = (x: number, y: number, z: number) => toRoom(fit, vec(new THREE.Vector3(x, y, z).applyQuaternion(rotation)));
      const objects = placeObjects(file, cameras, raw, toRoomPoint, fit.scale);
      this.overlay.setObjects(objects);
      this.overlay.setSpots(null);
      this.lastRender = null; // the room changed: re-render the sound
      this.set({ objects, rt60: this.rt60(objects), spots: 'idle', speakerScore: this.score(objects, this.state.speaker) });
    });
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getState = (): SoundState => this.state;

  placeSpeaker(): void {
    this.set({ placing: true });
    this.scene.armPlacement(this.fit.floorY, (world) => {
      if (this.disposed) return;
      const p = toRoom(this.fit, vec(world));
      this.setSpeaker(clampSpeaker(this.fit.dims, p));
    });
  }

  findBestSpot(): void {
    this.set({ spots: 'finding' });
    this.client
      .spots(this.room(this.state.speaker ?? clampSpeaker(this.fit.dims, { x: 0, z: 0 })))
      .then((map) => {
        if (this.disposed) return;
        this.overlay.setSpots(map);
        this.set({ spots: map });
      })
      .catch(() => {
        if (!this.disposed) this.set({ spots: 'failed' });
      });
  }

  moveSpeakerToBest(): void {
    const { spots } = this.state;
    if (typeof spots === 'object' && spots.best) this.setSpeaker(clampSpeaker(this.fit.dims, spots.best));
  }

  togglePlay(): void {
    if (!this.state.speaker) return;
    this.engine ??= new AudioEngine();
    if (this.state.playing) {
      this.engine.pause();
      return this.set({ playing: false });
    }
    if (this.clipLoaded !== this.state.clip) {
      this.engine.loadClip(synthClip(this.state.clip, this.engine.sampleRate), this.engine.sampleRate);
      this.clipLoaded = this.state.clip;
    }
    this.lastRender = null;
    void this.engine.play();
    this.set({ playing: true });
  }

  setClip(clip: DemoClipId): void {
    if (clip === this.state.clip) return;
    const wasPlaying = this.state.playing;
    this.set({ clip });
    if (!this.engine) return;
    this.engine.loadClip(synthClip(clip, this.engine.sampleRate), this.engine.sampleRate); // pauses
    this.clipLoaded = clip;
    if (wasPlaying) void this.engine.play();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.scene.onFrame === this.frame) this.scene.onFrame = null;
    this.client.dispose();
    this.engine?.dispose();
    this.overlay.dispose();
    this.listeners.clear();
  }

  private get objects(): RoomObject[] {
    return Array.isArray(this.state.objects) ? this.state.objects : [];
  }

  private room(speaker: Vec3, listener?: Vec3 & { yaw: number }) {
    const fallback = placeListener(this.fit.dims, speaker, { x: 0, y: 1.2, z: 0 }) ?? speaker;
    return soundRoom(this.fit.dims, this.objects, speaker, listener ?? { ...fallback, yaw: 0 });
  }

  private rt60(objects: RoomObject[]): number {
    const speaker = clampSpeaker(this.fit.dims, { x: 0, z: 0 });
    const listener = placeListener(this.fit.dims, speaker, { x: this.fit.dims.length, y: 1.2, z: this.fit.dims.width }) ?? speaker;
    return predictRt60(soundRoom(this.fit.dims, objects, speaker, { ...listener, yaw: 0 })).mid;
  }

  private score(objects: RoomObject[], speaker: Vec3 | null): number | null {
    if (!speaker) return null;
    return scoreSpeakerAt(soundRoom(this.fit.dims, objects, speaker, { ...speaker, yaw: 0 }), speaker);
  }

  private setSpeaker(speaker: Vec3): void {
    this.overlay.setSpeaker(speaker);
    this.lastRender = null;
    this.set({ speaker, placing: false, speakerScore: this.score(this.objects, speaker) });
  }

  /** Every frame: while music plays, re-render the room's sound once you've moved 25 cm or turned 15° (spec §7). */
  private readonly frame = (): void => {
    const { speaker, playing } = this.state;
    if (this.disposed || !playing || !speaker || this.rendering || !this.engine) return;
    const pose = this.scene.pose();
    const position = toRoom(this.fit, vec(pose.position));
    const yaw = roomYaw(this.fit, vec(pose.forward));
    const last = this.lastRender;
    if (last) {
      const moved = Math.hypot(position.x - last.position.x, position.y - last.position.y, position.z - last.position.z);
      const turned = Math.abs(Math.atan2(Math.sin(yaw - last.yaw), Math.cos(yaw - last.yaw)));
      if (moved < MOVE_TO_RENDER && turned < TURN_TO_RENDER) return;
    }
    const listener = placeListener(this.fit.dims, speaker, position);
    if (!listener) return;
    this.rendering = true;
    this.lastRender = { position, yaw };
    const engine = this.engine;
    this.client
      .ir(this.room(speaker, { ...listener, yaw }), engine.sampleRate)
      .then(({ ir }) => {
        if (!this.disposed) engine.setIrs(ir, silentIr(ir.sampleRate));
      })
      .catch(() => {}) // superseded or a bad spot: the next move tries again
      .finally(() => {
        this.rendering = false;
      });
  };

  private set(patch: Partial<SoundState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }
}
