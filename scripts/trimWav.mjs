/**
 * Keep the first `seconds` of a PCM WAV (16- or 24-bit, any channel count) and write it as 16-bit PCM with the same
 * channels and sample rate. Walks the RIFF chunks, so extra chunks (LIST and the like) and any header size are fine.
 * @param {Uint8Array} bytes the whole WAV file
 * @param {number} seconds how much to keep from the start (all of it if the file is shorter)
 * @returns {Uint8Array} the new WAV file
 */
export function trimWav(bytes, seconds) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a RIFF/WAVE file');
  let fmt = null;
  let data = null;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (tag(at) === 'fmt ') {
      fmt = { format: view.getUint16(body, true), channels: view.getUint16(body + 2, true), rate: view.getUint32(body + 4, true), bits: view.getUint16(body + 14, true) };
      if (fmt.format === 0xfffe) fmt.format = view.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE: the real format is in the sub-format
    } else if (tag(at) === 'data') {
      data = { start: body, length: Math.min(size, bytes.length - body) };
      break;
    }
    at = body + size + (size % 2); // chunks are padded to an even size
  }
  if (!fmt || !data) throw new Error('Missing fmt or data chunk');
  if (fmt.format !== 1 || (fmt.bits !== 16 && fmt.bits !== 24)) throw new Error('Only 16- or 24-bit PCM is supported');
  const step = fmt.bits / 8;
  const frameBytes = step * fmt.channels;
  const frames = Math.min(Math.floor(data.length / frameBytes), Math.round(seconds * fmt.rate));
  const outData = frames * fmt.channels * 2;
  const out = new Uint8Array(44 + outData);
  const o = new DataView(out.buffer);
  const put = (at, text) => [...text].forEach((c, i) => (out[at + i] = c.charCodeAt(0)));
  put(0, 'RIFF');
  o.setUint32(4, 36 + outData, true);
  put(8, 'WAVEfmt ');
  o.setUint32(16, 16, true);
  o.setUint16(20, 1, true);
  o.setUint16(22, fmt.channels, true);
  o.setUint32(24, fmt.rate, true);
  o.setUint32(28, fmt.rate * fmt.channels * 2, true);
  o.setUint16(32, fmt.channels * 2, true);
  o.setUint16(34, 16, true);
  put(36, 'data');
  o.setUint32(40, outData, true);
  for (let i = 0; i < frames * fmt.channels; i++) {
    const at = data.start + i * step;
    const sample = fmt.bits === 16 ? view.getInt16(at, true) / 32768 : ((view.getUint8(at + 2) << 24) | (view.getUint8(at + 1) << 16) | (view.getUint8(at) << 8)) / 2147483648;
    o.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), true);
  }
  return out;
}
