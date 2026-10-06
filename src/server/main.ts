import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JobQueue } from './jobs';
import { dockerRunner, pipelineHealth } from './runner';
import { createServer } from './server';

/** Spec 2026-10-06 §3: job folders live outside the repo, which is in OneDrive. */
const JOBS_DIR =
  process.env.ROOM_REMIX_JOBS_DIR ?? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), '.local', 'share'), 'RoomRemix', 'jobs');
const PORT = Number(process.env.PORT ?? 8080);
const STATIC_DIR = path.resolve('out');

const NOT_READY = {
  'no-docker': "Docker isn't running. Start Docker Desktop, then reload the page on the phone.",
  'no-image': 'The pipeline image is missing. Run npm run pipeline:build, then reload the page on the phone.',
};

function lanAddresses(): string[] {
  const addresses: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const address of list ?? []) if (address.family === 'IPv4' && !address.internal) addresses.push(address.address);
  }
  return addresses;
}

async function main(): Promise<void> {
  if (!existsSync(path.join(STATIC_DIR, 'index.html'))) {
    console.error('There is no built app in out/. Run npm run demo, which builds it first.');
    process.exit(1);
  }
  const queue = new JobQueue(JOBS_DIR, dockerRunner());
  await queue.init();
  const server = createServer({ jobs: queue, health: pipelineHealth, staticDir: STATIC_DIR });
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Room Remix demo server. Job folders: ${JOBS_DIR}`);
    for (const address of lanAddresses()) console.log(`  On a phone on this Wi-Fi: http://${address}:${PORT}`);
    console.log(`  On this laptop:           http://localhost:${PORT}`);
    void pipelineHealth().then((health) =>
      console.log(health === 'ready' ? 'Scan builder ready.' : `Scan builder not ready: ${NOT_READY[health]}`),
    );
  });
}

void main();
