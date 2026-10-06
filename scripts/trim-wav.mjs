// Usage: node scripts/trim-wav.mjs <in.wav> <out.wav> <seconds>
import { readFileSync, writeFileSync } from 'node:fs';
import { trimWav } from './trimWav.mjs';

const [input, output, seconds] = process.argv.slice(2);
if (!input || !output || !(Number(seconds) > 0)) {
  console.error('Usage: node scripts/trim-wav.mjs <in.wav> <out.wav> <seconds>');
  process.exit(1);
}
const result = trimWav(new Uint8Array(readFileSync(input)), Number(seconds));
writeFileSync(output, result);
console.log(`${output}: ${result.length} bytes`);
