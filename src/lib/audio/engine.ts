import type { StereoIr } from '@/lib/acoustics/simulate';
import { downmixToMono, modeGains, normalizeIr, type ListenMode } from './mix';

export const CROSSFADE_SECONDS = 0.05;
const MASTER_GAIN = 0.5; // −6 dB headroom: convolving with a dense room IR raises peaks well above the dry track's
// Safety limiter before the output: catches the rare peak that still overshoots, instead of hard clipping.
const LIMITER: DynamicsCompressorOptions = { threshold: -1, knee: 0, ratio: 20, attack: 0.003, release: 0.1 };
const MAX_WARM_UP_SECONDS = 0.5; // a new convolver runs silently up to this long so it holds the playing music's reverb
const RETIRE_MARGIN_MS = 50; // disconnect the faded-out convolver this long after its fade ends, to absorb timer jitter

type Pair = { conv: ConvolverNode; gain: GainNode };

/**
 * One room's reverb. `active` is the pair being heard. A new IR gets its own `pending` pair, which warms up
 * silently, then crossfades in; when the fade ends it becomes `active` and the old pair is disconnected.
 */
type Slot = {
  out: GainNode;
  active: Pair | null;
  pending: Pair | null;
  ir: StereoIr | null; // raw IR of `pending ?? active`, to skip reloading an identical one
  fadeEnd: number; // context time at which `pending` is fully faded in
  retireTimer?: ReturnType<typeof setTimeout>;
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
    const master = new GainNode(this.ctx, { gain: MASTER_GAIN });
    master.connect(new DynamicsCompressorNode(this.ctx, LIMITER)).connect(this.ctx.destination);
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
    for (const slot of [this.slots.now, this.slots.withFixes]) clearTimeout(slot.retireTimer);
    this.source?.stop();
    void this.ctx.close();
  }

  private createSlot(master: GainNode): Slot {
    const out = new GainNode(this.ctx, { gain: 0 });
    out.connect(master);
    return { out, active: null, pending: null, ir: null, fadeEnd: 0 };
  }

  private loadSlot(slot: Slot, ir: StereoIr): void {
    if (sameIr(slot.ir, ir)) return; // the simulation is deterministic, so an unchanged room gives an identical IR
    const buffer = this.irBuffer(ir); // before touching the slot, so a bad IR leaves it as it was
    slot.ir = ir;
    const t = this.ctx.currentTime;
    if (slot.pending && t >= slot.fadeEnd) this.finishSwap(slot); // the pending pair is already fully faded in

    if (!slot.active || this.ctx.state !== 'running') {
      // Nothing is audible (first IR, or the context isn't running), so there is no reverb to keep: switch at once.
      this.dropPending(slot);
      if (slot.active) this.disconnectPair(slot.active);
      slot.active = this.connectPair(slot, buffer, 1);
      return;
    }

    if (slot.pending) {
      // A newer IR replaces one still warming up or fading in, which was never fully heard.
      this.dropPending(slot);
      ramp(slot.active.gain.gain, 1, t); // cancels any fade-out of the heard pair and brings it back to full gain
    }

    // Warm up: the new convolver fills with the music already playing before it is heard, so the reverb never dips.
    const warm = Math.min(ir.left.length / ir.sampleRate, MAX_WARM_UP_SECONDS);
    const start = t + warm;
    const old = slot.active;
    const fresh = this.connectPair(slot, buffer, 0);
    fresh.gain.gain.setValueAtTime(0, start);
    fresh.gain.gain.linearRampToValueAtTime(1, start + CROSSFADE_SECONDS);
    old.gain.gain.setValueAtTime(1, start);
    old.gain.gain.linearRampToValueAtTime(0, start + CROSSFADE_SECONDS);
    slot.pending = fresh;
    slot.fadeEnd = start + CROSSFADE_SECONDS;
    this.scheduleRetire(slot, old, fresh);
  }

  /** Retires `old` once the audio clock has passed the end of the crossfade, checking again if it lags the timer. */
  private scheduleRetire(slot: Slot, old: Pair, fresh: Pair): void {
    const remaining = slot.fadeEnd - this.ctx.currentTime;
    slot.retireTimer = setTimeout(() => {
      if (slot.active !== old || slot.pending !== fresh) return; // superseded: not ours to retire any more
      if (this.ctx.currentTime < slot.fadeEnd) this.scheduleRetire(slot, old, fresh);
      else this.finishSwap(slot);
    }, remaining * 1000 + RETIRE_MARGIN_MS);
  }

  /** The pending pair has faded in: disconnect the old pair and make the pending one active. */
  private finishSwap(slot: Slot): void {
    clearTimeout(slot.retireTimer);
    slot.retireTimer = undefined;
    if (slot.active) this.disconnectPair(slot.active);
    slot.active = slot.pending;
    slot.pending = null;
  }

  private dropPending(slot: Slot): void {
    clearTimeout(slot.retireTimer);
    slot.retireTimer = undefined;
    if (slot.pending) this.disconnectPair(slot.pending);
    slot.pending = null;
  }

  private irBuffer(ir: StereoIr): AudioBuffer {
    const normalized = normalizeIr(ir);
    const buffer = this.ctx.createBuffer(2, normalized.left.length, normalized.sampleRate);
    buffer.getChannelData(0).set(normalized.left);
    buffer.getChannelData(1).set(normalized.right);
    return buffer;
  }

  /** input → convolver → its own gain → slot output. */
  private connectPair(slot: Slot, buffer: AudioBuffer, gain: number): Pair {
    const pair = {
      conv: new ConvolverNode(this.ctx, { disableNormalization: true, buffer }),
      gain: new GainNode(this.ctx, { gain }),
    };
    this.input.connect(pair.conv).connect(pair.gain).connect(slot.out);
    return pair;
  }

  private disconnectPair(pair: Pair): void {
    this.input.disconnect(pair.conv);
    pair.conv.disconnect();
    pair.gain.disconnect();
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

/** Same sample rate, same length and exactly the same samples. */
function sameIr(a: StereoIr | null, b: StereoIr): boolean {
  if (!a || a.sampleRate !== b.sampleRate || a.left.length !== b.left.length || a.right.length !== b.right.length) {
    return false;
  }
  for (let i = 0; i < a.left.length; i++) if (a.left[i] !== b.left[i]) return false;
  for (let i = 0; i < a.right.length; i++) if (a.right[i] !== b.right[i]) return false;
  return true;
}
