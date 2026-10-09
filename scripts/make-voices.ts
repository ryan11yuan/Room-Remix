/**
 * Records the voice clips into public/voices (spec 2026-10-08 §8.2). Run by hand, never during a build:
 *   npm run voices                      Kokoro, every clip
 *   npm run voices -- --sapi            Windows' built-in voice instead
 *   npm run voices -- --only=door,tvs   just these clips
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { decodeWav, encodeWav, trimSilence } from '@/lib/audio/wav';
import { CLIPS } from '@/lib/explore/names';

type Speak = (words: string) => Promise<{ samples: Float32Array; sampleRate: number }>;
type KokoroModule = {
  KokoroTTS: {
    from_pretrained(model: string, options: { dtype: string; device: string }): Promise<{
      generate(text: string, options: { voice: string }): Promise<{ audio: Float32Array; sampling_rate: number }>;
    }>;
  };
};

const OUT = path.join(process.cwd(), 'public', 'voices');
const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const KOKORO_VOICE = 'af_heart';

async function kokoro(): Promise<Speak> {
  const { KokoroTTS } = (await import('kokoro-js')) as unknown as KokoroModule;
  const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL, { dtype: 'q8', device: 'cpu' });
  return async (words) => {
    const audio = await tts.generate(words, { voice: KOKORO_VOICE });
    return { samples: audio.audio, sampleRate: audio.sampling_rate };
  };
}

/** Windows' built-in voice through System.Speech, written to a temporary WAV. */
function sapi(): Speak {
  const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
  return async (words) => {
    const file = path.join(os.tmpdir(), `rr-voice-${process.pid}.wav`);
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      `$s.SetOutputToWaveFile(${quote(file)})`,
      `$s.Speak(${quote(words)})`,
      '$s.Dispose()',
    ].join('; ');
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
    try {
      return decodeWav(new Uint8Array(await readFile(file)));
    } finally {
      await rm(file, { force: true });
    }
  };
}

// No top-level await: package.json has no "type": "module", so tsx runs this as CommonJS (like src/server/main.ts).
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',');
  const speak = args.includes('--sapi') ? sapi() : await kokoro();
  await mkdir(OUT, { recursive: true });
  for (const [id, words] of CLIPS) {
    if (only && !only.includes(id)) continue;
    const { samples, sampleRate } = await speak(words);
    const trimmed = trimSilence(samples, sampleRate);
    if (trimmed.length === 0) throw new Error(`"${words}" came out silent`);
    await writeFile(path.join(OUT, `${id}.wav`), encodeWav(trimmed, sampleRate));
    console.log(`${id}.wav  "${words}"  ${(trimmed.length / sampleRate).toFixed(2)} s`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
