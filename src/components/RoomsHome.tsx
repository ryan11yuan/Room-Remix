'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { fetchHealth, fetchRooms } from '@/lib/splatJobs/client';
import { NOT_RUNNING } from '@/lib/splatJobs/panel';
import type { Health, RoomSummary } from '@/lib/splatJobs/protocol';
import { roomFromHash, roomHash, roomLabel } from '@/lib/viewer/rooms';
import { SplatViewer } from './SplatViewer';
import { useVideoScan } from './useVideoScan';
import { VideoScanPanel, VideoScanProgress } from './VideoScanPanel';

const BUILD_KEY = 'home'; // useVideoScan remembers the running build per key; this page has one
const subscribeHash = (changed: () => void) => {
  window.addEventListener('hashchange', changed);
  return () => window.removeEventListener('hashchange', changed);
};

/** The whole app now (spec 2026-10-07 §3): import a video, follow its build, and open rooms in the viewer. */
export function RoomsHome() {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => '');
  const openRoom = roomFromHash(hash);
  const [health, setHealth] = useState<Health | null | undefined>(undefined); // undefined: still asking
  const [rooms, setRooms] = useState<RoomSummary[] | null | undefined>(undefined); // undefined: loading, null: failed
  const [listVersion, setListVersion] = useState(0);
  const openedHere = useRef(false); // Back goes back in history only if this page opened the viewer

  useEffect(() => {
    let live = true;
    void fetchHealth().then((answer) => {
      if (live) setHealth(answer);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    void fetchRooms().then((list) => {
      if (live) setRooms(list);
    });
    return () => {
      live = false;
    };
  }, [listVersion]);

  const open = useCallback((id: string) => {
    openedHere.current = true;
    window.location.hash = roomHash(id);
  }, []);

  const onReady = useCallback(
    (_file: File, _key: string, jobId: string) => {
      setListVersion((n) => n + 1);
      // Only take the person to the new room if they aren't already in one; otherwise it just joins the list.
      if (!roomFromHash(window.location.hash)) open(jobId);
    },
    [open],
  );
  const build = useVideoScan(BUILD_KEY, onReady);

  const back = () => {
    if (openedHere.current) {
      openedHere.current = false;
      window.history.back();
    } else {
      window.location.hash = '';
    }
  };

  if (openRoom) return <SplatViewer roomId={openRoom} onBack={back} />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold">Room Remix</h1>
        <p className="text-lg text-neutral-300">Import a video of your room and walk around it in 3D.</p>
      </header>
      {health === null && rooms === null && (
        <p className="text-neutral-300">
          Start the room builder with <code className="rounded bg-neutral-800 px-1">pnpm run demo</code>, then open
          http://localhost:8080.
        </p>
      )}
      {health === undefined && (
        <section aria-label="Import a video" className="flex flex-col gap-3">
          <p className="text-neutral-400">Checking the room builder…</p>
        </section>
      )}
      {(health || (health === null && rooms !== null)) && (
        <section aria-label="Import a video" className="flex flex-col gap-3">
          {(!health || health.pipeline !== 'ready') && <p className="text-amber-200">{NOT_RUNNING}</p>}
          {health && health.pipeline === 'ready' && (build.state.kind === 'idle' || build.state.kind === 'uploading') && (
            <VideoScanPanel
              state={build.state}
              onStart={build.start}
              onCancel={build.cancel}
              buttonLabel="Import a video"
              showPrivacy={false}
            />
          )}
          {(build.state.kind === 'building' || build.state.kind === 'downloading' || build.state.kind === 'failed') && (
            <VideoScanProgress state={build.state} onCancel={build.cancel} onDismiss={build.dismiss} onRetry={build.retry} />
          )}
        </section>
      )}
      {!(health === null && rooms === null) && (
        <section aria-labelledby="your-rooms" className="flex flex-col gap-3">
          <h2 id="your-rooms" className="text-xl font-semibold">
            Your rooms
          </h2>
          {rooms === undefined && <p className="text-neutral-400">Loading your rooms…</p>}
          {rooms === null && <p className="text-neutral-400">Couldn&apos;t load the rooms on this laptop.</p>}
          {rooms?.length === 0 && <p className="text-neutral-400">No rooms yet. Import a video to make one.</p>}
          {rooms && rooms.length > 0 && (
            <ul className="flex flex-col gap-2">
              {rooms.map((room) => (
                <li key={room.id}>
                  <button
                    onClick={() => open(room.id)}
                    className="flex min-h-11 w-full items-center rounded-lg border border-neutral-800 px-4 text-left hover:border-neutral-600"
                  >
                    {roomLabel(room)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
