import type { StereoIr } from '@/lib/acoustics/simulate';
import { downmixToMono, modeGains, normalizeIr, type ListenMode } from './mix';

export const CROSSFADE_SECONDS = 0.05;

type Slot = {
  convolvers: [ConvolverNode, ConvolverNode];
  gains: [GainNode, GainNode];
  active: 0 | 1;
  out: GainNode;
  loaded: boolean;
};

/** Plays one song dry, through the "now" room, or through the room with fixes, switching without clicks. */
export class AudioEngine {
  private readonly ctx: AudioContext;
  private readonly input: GainNode;
  private readonly dry: GainNode;
  private readonly slots: { now: Slot; withFixes: Slot };
  private song: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private startedAt = 0;
  private offset = 0;
  private mode: ListenMode = { room: true, fixes: false };
  private playToken = 0; // bumped by pause() so a play() still waiting for the context to resume gives up

  constructor() {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback'; // keep playing with the iPhone silent switch on
    this.ctx = new AudioContext({ latencyHint: 'playback' });
    const master = new GainNode(this.ctx);
    master.connect(this.ctx.destination);
    this.input = new GainNode(this.ctx);
    this.dry = new GainNode(this.ctx, { gain: 0 });
    this.input.connect(this.dry).connect(master);
    this.slots = { now: this.createSlot(master), withFixes: this.createSlot(master) };
    this.applyMode(0);
  }

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  get playing(): boolean {
    return this.source !== null;
  }

  /** Decodes a local file (never uploaded) and mixes it to mono: one speaker is one point source. */
  async loadSong(file: File): Promise<void> {
    const decoded = await this.ctx.decodeAudioData(await file.arrayBuffer());
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    const mono = this.ctx.createBuffer(1, decoded.length, decoded.sampleRate);
    mono.getChannelData(0).set(downmixToMono(channels));
    this.pause();
    this.offset = 0;
    this.song = mono;
  }

  async play(): Promise<void> {
    if (!this.song || this.source) return;
    const token = ++this.playToken;
    await this.ctx.resume();
    if (token !== this.playToken || this.source || !this.song) return;
    const source = new AudioBufferSourceNode(this.ctx, { buffer: this.song, loop: true });
    source.connect(this.input);
    source.start(0, this.offset);
    this.startedAt = this.ctx.currentTime - this.offset;
    this.source = source;
  }

  pause(): void {
    this.playToken++;
    if (!this.source || !this.song) return;
    this.offset = (this.ctx.currentTime - this.startedAt) % this.song.duration;
    this.source.stop();
    this.source.disconnect();
    this.source = null;
  }

  setIrs(now: StereoIr, withFixes: StereoIr): void {
    this.loadSlot(this.slots.now, now);
    this.loadSlot(this.slots.withFixes, withFixes);
  }

  setMode(mode: ListenMode): void {
    this.mode = mode;
    this.applyMode(CROSSFADE_SECONDS);
  }

  dispose(): void {
    this.source?.stop();
    void this.ctx.close();
  }

  private createSlot(master: GainNode): Slot {
    const out = new GainNode(this.ctx, { gain: 0 });
    out.connect(master);
    const pair = (): [ConvolverNode, GainNode] => {
      const conv = new ConvolverNode(this.ctx, { disableNormalization: true });
      const gain = new GainNode(this.ctx, { gain: 0 });
      conv.connect(gain).connect(out);
      return [conv, gain];
    };
    const [c0, g0] = pair();
    const [c1, g1] = pair();
    return { convolvers: [c0, c1], gains: [g0, g1], active: 0, out, loaded: false };
  }

  private loadSlot(slot: Slot, ir: StereoIr): void {
    const idle = slot.active === 0 ? 1 : 0;
    const old = slot.convolvers[idle];
    try {
      this.input.disconnect(old);
    } catch {
      // never connected yet
    }
    old.disconnect();

    const normalized = normalizeIr(ir);
    const buffer = this.ctx.createBuffer(2, normalized.left.length, normalized.sampleRate);
    buffer.getChannelData(0).set(normalized.left);
    buffer.getChannelData(1).set(normalized.right);
    const conv = new ConvolverNode(this.ctx, { disableNormalization: true, buffer });
    this.input.connect(conv);
    conv.connect(slot.gains[idle]);
    slot.convolvers[idle] = conv;

    const t = this.ctx.currentTime;
    if (slot.loaded) {
      ramp(slot.gains[idle].gain, 1, t);
      ramp(slot.gains[slot.active].gain, 0, t);
    } else {
      slot.gains[idle].gain.setValueAtTime(1, t);
    }
    slot.active = idle;
    slot.loaded = true;
  }

  private applyMode(seconds: number): void {
    const g = modeGains(this.mode);
    const t = this.ctx.currentTime;
    ramp(this.dry.gain, g.dry, t, seconds);
    ramp(this.slots.now.out.gain, g.now, t, seconds);
    ramp(this.slots.withFixes.out.gain, g.withFixes, t, seconds);
  }
}

function ramp(param: AudioParam, value: number, t: number, seconds = CROSSFADE_SECONDS): void {
  param.cancelScheduledValues(t);
  param.setValueAtTime(param.value, t);
  if (seconds > 0) param.linearRampToValueAtTime(value, t + seconds);
  else param.setValueAtTime(value, t);
}
