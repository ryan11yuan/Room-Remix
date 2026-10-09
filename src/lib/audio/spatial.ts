import { echoIr } from '@/lib/explore/echo';
import type { Dims, Vec3 } from '@/lib/room/types';
import { chime, footstep, pulse, thud } from './sounds';

/** Starting levels, tuned in the headphone check (spec 2026-10-08 §8.1). */
export const ECHO_SEND_DB = -10;
export const ROLLOFF = 0.6;

const gainOf = (db: number) => 10 ** (db / 20);

/**
 * The explorer's sound (spec §8): clips, pulse and thud from their positions through HRTF panners, footsteps and chime in
 * the head, all through one light echo. Room metres throughout; the listener follows the explorer. Browser only.
 */
export class SpatialAudio {
  private readonly clips = new Map<string, AudioBuffer>();
  private readonly playing = new Set<AudioBufferSourceNode>();
  private readonly dry: GainNode;
  private readonly send: GainNode;
  private readonly sounds: Record<'footstep' | 'thud' | 'pulse' | 'chime', AudioBuffer>;

  /** Call from a click: the AudioContext must start inside a user gesture. Rejects if any clip can't be loaded. */
  static async create(
    dims: Dims,
    clipIds: Iterable<string>,
    fetchFn: (url: string) => Promise<Response> = (url) => fetch(url),
  ): Promise<SpatialAudio> {
    const ctx = new AudioContext();
    const resumed = ctx.resume();
    try {
      const audio = new SpatialAudio(ctx, dims);
      await Promise.all([
        resumed,
        ...[...clipIds].map(async (id) => {
          const res = await fetchFn(`/voices/${id}.wav`);
          if (!res.ok) throw new Error(`Voice clip ${id}: HTTP ${res.status}`);
          audio.clips.set(id, await ctx.decodeAudioData(await res.arrayBuffer()));
        }),
      ]);
      return audio;
    } catch (error) {
      void ctx.close();
      throw error;
    }
  }

  private constructor(
    private readonly ctx: AudioContext,
    dims: Dims,
  ) {
    const master = ctx.createGain();
    master.connect(ctx.destination);
    this.dry = ctx.createGain();
    this.dry.connect(master);
    const ir = echoIr(dims, ctx.sampleRate);
    const echo = ctx.createBuffer(2, ir.left.length, ctx.sampleRate);
    echo.copyToChannel(ir.left as Float32Array<ArrayBuffer>, 0);
    echo.copyToChannel(ir.right as Float32Array<ArrayBuffer>, 1);
    const convolver = ctx.createConvolver();
    convolver.normalize = true;
    convolver.buffer = echo;
    convolver.connect(master);
    this.send = ctx.createGain();
    this.send.gain.value = gainOf(ECHO_SEND_DB);
    this.send.connect(convolver);
    const buffer = (samples: Float32Array) => {
      const b = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      b.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      return b;
    };
    const rate = ctx.sampleRate;
    this.sounds = { footstep: buffer(footstep(rate)), thud: buffer(thud(rate)), pulse: buffer(pulse(rate)), chime: buffer(chime(rate)) };
  }

  /** The ears: at `at`, facing `heading` (room metres, atan2 of z over x), head upright. */
  setListener(at: Vec3, heading: number): void {
    const l = this.ctx.listener;
    const [fx, fz] = [Math.cos(heading), Math.sin(heading)];
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setValueAtTime(at.x, t);
      l.positionY.setValueAtTime(at.y, t);
      l.positionZ.setValueAtTime(at.z, t);
      l.forwardX.setValueAtTime(fx, t);
      l.forwardY.setValueAtTime(0, t);
      l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(at.x, at.y, at.z); // older browsers
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  /** A name from a point in the room; resolves when it has finished (or straight away for an unknown clip). */
  playClip(id: string, at: Vec3): Promise<void> {
    const clip = this.clips.get(id);
    return clip ? this.play(clip, at) : Promise.resolve();
  }

  playThud = (at: Vec3): Promise<void> => this.play(this.sounds.thud, at);
  playPulse = (at: Vec3): Promise<void> => this.play(this.sounds.pulse, at);
  playFootstep = (): Promise<void> => this.play(this.sounds.footstep, null);
  playChime = (): Promise<void> => this.play(this.sounds.chime, null);

  /** Browsers can suspend an idle context; call this inside the click that starts a session. */
  resume(): Promise<void> {
    return this.ctx.resume();
  }

  stopAll(): void {
    for (const source of [...this.playing]) source.stop();
  }

  dispose(): void {
    this.stopAll();
    void this.ctx.close();
  }

  private play(buffer: AudioBuffer, at: Vec3 | null): Promise<void> {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    let out: AudioNode = source;
    if (at) {
      const panner = new PannerNode(this.ctx, {
        panningModel: 'HRTF',
        distanceModel: 'inverse',
        refDistance: 1,
        rolloffFactor: ROLLOFF,
        positionX: at.x,
        positionY: at.y,
        positionZ: at.z,
      });
      source.connect(panner);
      out = panner;
    }
    out.connect(this.dry);
    out.connect(this.send);
    this.playing.add(source);
    return new Promise((resolve) => {
      source.onended = () => {
        this.playing.delete(source);
        out.disconnect();
        resolve();
      };
      source.start();
    });
  }
}
