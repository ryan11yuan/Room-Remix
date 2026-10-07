import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JobQueue } from './jobs';
import { dockerRunner, pipelineHealth, removeLeftoverContainers } from './runner';
import { createServer } from './server';

/** Spec 2026-10-06 §3: job folders live outside the repo, which is in OneDrive. */
const JOBS_DIR = path.resolve(
  process.env.ROOM_REMIX_JOBS_DIR ?? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), '.local', 'share'), 'RoomRemix', 'jobs'),
);
const PORT = Number(process.env.PORT ?? 8080);
const STATIC_DIR = path.resolve('out');

const NOT_READY = {
  'no-docker': "Docker isn't running. Start Docker Desktop, then reload the page on the phone.",
  'no-image': 'The pipeline image is missing. Run npm run pipeline:build, then reload the page on the phone.',
};

/** Addresses a phone might use, each with its adapter's name. Link-local ones are skipped; virtual (vEthernet) adapters go last. */
function lanAddresses(): { address: string; name: string }[] {
  const addresses: { address: string; name: string }[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const entry of list ?? []) {
      if (entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.')) addresses.push({ address: entry.address, name });
    }
  }
  const virtual = (name: string) => name.startsWith('vEthernet');
  return addresses.sort((a, b) => Number(virtual(a.name)) - Number(virtual(b.name)));
}

async function main(): Promise<void> {
  if (!existsSync(path.join(STATIC_DIR, 'index.html'))) {
    console.error('There is no built app in out/. Run npm run demo, which builds it first.');
    process.exit(1);
  }
  const queue = new JobQueue(JOBS_DIR, dockerRunner());
  await queue.init();
  const removed = await removeLeftoverContainers();
  if (removed > 0) console.log(`Removed ${removed} leftover pipeline container${removed === 1 ? '' : 's'}.`);
  const server = createServer({ jobs: queue, health: pipelineHealth, busy: () => queue.busy, staticDir: STATIC_DIR });
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Room Remix demo server. Job folders: ${JOBS_DIR}`);
    for (const { address, name } of lanAddresses()) console.log(`  On a phone on this Wi-Fi: http://${address}:${PORT}  (${name})`);
    console.log(`  On this laptop:           http://localhost:${PORT}`);
    void pipelineHealth().then((health) =>
      console.log(health === 'ready' ? 'Scan builder ready.' : `Scan builder not ready: ${NOT_READY[health]}`),
    );
  });
}

void main();
