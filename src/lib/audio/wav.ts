/** 16-bit PCM WAV, for the voice clips (spec 2026-10-08 §8.2). */

/** Mono 16-bit PCM WAV bytes for samples in [−1, 1]. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const data = samples.length * 2;
  const v = new DataView(new ArrayBuffer(44 + data));
  const text = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  v.setUint32(4, 36 + data, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, data, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + 2 * i, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return new Uint8Array(v.buffer);
}

/** The samples (mixed to mono) and rate of a 16-bit PCM WAV. Throws on anything else. */
export function decodeWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (v.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file');
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  for (let o = 12; o + 8 <= v.byteLength; ) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    const body = o + 8;
    if (id === 'fmt ') {
      format = v.getUint16(body, true);
      channels = v.getUint16(body + 2, true);
      sampleRate = v.getUint32(body + 4, true);
      bits = v.getUint16(body + 14, true);
    } else if (id === 'data') {
      if (format !== 1 || bits !== 16 || channels < 1) throw new Error('Only 16-bit PCM WAV is supported');
      const frames = Math.floor(Math.min(size, v.byteLength - body) / (2 * channels));
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += v.getInt16(body + 2 * (i * channels + c), true);
        samples[i] = sum / channels / 32768;
      }
      return { samples, sampleRate };
    }
    o = body + size + (size % 2);
  }
  throw new Error('WAV file has no data');
}

/** Cut leading and trailing silence (at or below `thresholdDb` of full scale), keeping `padSeconds` either side. */
export function trimSilence(samples: Float32Array, sampleRate: number, thresholdDb = -45, padSeconds = 0.01): Float32Array {
  const threshold = 10 ** (thresholdDb / 20);
  const first = samples.findIndex((s) => Math.abs(s) > threshold);
  if (first === -1) return new Float32Array(0);
  let last = samples.length - 1;
  while (Math.abs(samples[last]) <= threshold) last--;
  const pad = Math.round(padSeconds * sampleRate);
  return samples.slice(Math.max(0, first - pad), Math.min(samples.length, last + pad + 1));
}
