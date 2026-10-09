'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { fetchHealth, fetchRooms } from '@/lib/splatJobs/client';
import type { Health, RoomSummary } from '@/lib/splatJobs/protocol';
import { roomFromHash, roomHash, roomLabel } from '@/lib/viewer/rooms';
import { Arrow } from './Arrow';
import { HomeImport } from './HomeImport';
import { RoomSketch } from './RoomSketch';
import { RoomStage } from './RoomStage';
import { SplatViewer } from './SplatViewer';
import { useVideoScan } from './useVideoScan';

const BUILD_KEY = 'home'; // useVideoScan remembers the running build per key; this page has one
const subscribeHash = (changed: () => void) => {
  window.addEventListener('hashchange', changed);
  return () => window.removeEventListener('hashchange', changed);
};

const SECTIONS = [
  { id: 'intro', name: 'Intro' },
  { id: 'import', name: 'Import' },
  { id: 'rooms', name: 'Rooms' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

/** What each tool in the pipeline does, credited by name. */
const PIPELINE: readonly { step: string; tool: string }[] = [
  { step: 'Frames from the video', tool: 'ffmpeg' },
  { step: 'Where the camera stood', tool: 'COLMAP' },
  { step: 'The room, as a splat', tool: 'OpenSplat' },
  { step: 'Walking around it', tool: 'Spark' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const dateOf = (room: RoomSummary) =>
  new Date(room.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const timeOf = (room: RoomSummary) => new Date(room.createdAt).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' });
const qualityOf = (room: RoomSummary) => (room.quality === 'best' ? 'Best' : 'Quick');

/** Newest first, grouped by the day they were made; each keeps its serial number (the oldest room is 01). */
function byDay(rooms: RoomSummary[]): { day: string; entries: { room: RoomSummary; serial: number }[] }[] {
  const days: { day: string; entries: { room: RoomSummary; serial: number }[] }[] = [];
  rooms.forEach((room, i) => {
    const day = dateOf(room);
    const entry = { room, serial: rooms.length - i };
    if (days.at(-1)?.day === day) days.at(-1)!.entries.push(entry);
    else days.push({ day, entries: [entry] });
  });
  return days;
}

/** Scroll to a section without adding to the history: the hash belongs to the viewer (`#room=<id>`). */
function goTo(event: MouseEvent<HTMLAnchorElement>, id: SectionId) {
  const section = document.getElementById(id);
  if (!section) return;
  event.preventDefault();
  section.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/** The section in the middle of the screen, for the nav's dashed underline. */
function useCurrentSection(): SectionId {
  const [current, setCurrent] = useState<SectionId>('intro');
  useEffect(() => {
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setCurrent(entry.target.id as SectionId);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    for (const { id } of SECTIONS) {
      const section = document.getElementById(id);
      if (section) seen.observe(section);
    }
    return () => seen.disconnect();
  }, []);
  return current;
}

function TopNav() {
  const current = useCurrentSection();
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 bg-linear-to-b from-walnut/80 to-transparent">
      <div className="flex items-center justify-between gap-6 px-4 py-5 sm:px-6">
        <a href="#intro" onClick={(e) => goTo(e, 'intro')} className="pointer-events-auto text-ui">
          Room Remix
        </a>
        <nav aria-label="Sections" className="pointer-events-auto">
          <ul className="flex gap-5 text-label sm:gap-8">
            {SECTIONS.map(({ id, name }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  onClick={(e) => goTo(e, id)}
                  aria-current={current === id ? 'location' : undefined}
                  className="inline-flex min-h-11 items-center"
                >
                  <span className={`border-b border-dashed pb-1 ${current === id ? 'border-cream' : 'border-transparent'}`}>{name}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}

/** The newest room's card, bottom left of the hero: when it was made, and the way in. */
function NewestCard({ rooms, onOpen }: { rooms: RoomSummary[] | null | undefined; onOpen: (id: string) => void }) {
  const newest = rooms?.[0];
  return (
    <div className="flex w-full flex-col gap-4 rounded-card border border-cork bg-walnut/75 p-5 sm:w-80">
      {rooms === undefined && <p className="text-ui text-cream/70">Loading your rooms…</p>}
      {rooms === null && <p className="text-ui">Couldn&apos;t load the rooms on this laptop.</p>}
      {rooms?.length === 0 && (
        <>
          <p className="text-heading-sm">No rooms yet.</p>
          <div className="rule" />
          <p className="voice text-sub text-cream/70">Import a video to make the first one.</p>
          <a href="#import" onClick={(e) => goTo(e, 'import')} className="pill self-start">
            Import a video
            <Arrow to="down" />
          </a>
        </>
      )}
      {newest && (
        <>
          <p className="text-heading-sm">
            {dateOf(newest)}
            <br />
            {timeOf(newest)}
          </p>
          <div className="rule" />
          <p className="text-label text-cream/70">
            {`${qualityOf(newest)} · the newest of ${rooms.length} ${rooms.length === 1 ? 'room' : 'rooms'}`}
          </p>
          <button onClick={() => onOpen(newest.id)} className="pill self-start">
            Enter the room
            <Arrow to="right" />
          </button>
        </>
      )}
    </div>
  );
}

function Hero({ rooms, onOpen }: { rooms: RoomSummary[] | null | undefined; onOpen: (id: string) => void }) {
  return (
    <section
      aria-label="Room Remix"
      className="relative flex min-h-svh flex-col px-4 pb-6 pt-24 sm:px-6 md:bg-[linear-gradient(to_left,rgb(16_9_4/0.85),rgb(16_9_4/0.4)_28%,transparent_45%)] md:pr-14"
    >
      <p className="text-label">Made from one video. Built on this laptop.</p>
      <div className="mt-4 flex items-end justify-between gap-8">
        <h1 className="text-[clamp(64px,min(13.5vw,21svh),208px)] leading-[0.9]">
          Room
          <br />
          Remix
        </h1>
        <p className="voice hidden max-w-[11em] pb-2 text-body md:block">Film a place once. Someone who can&apos;t see it can explore it by sound.</p>
      </div>
      <div className="mt-auto flex flex-col items-start justify-between gap-4 pt-10 sm:flex-row sm:items-end">
        <NewestCard rooms={rooms} onOpen={onOpen} />
        <a
          href="#import"
          onClick={(e) => goTo(e, 'import')}
          className="hidden flex-col gap-3 rounded-card border border-cork bg-walnut/75 p-4 text-label transition-colors duration-200 ease-develop hover:border-cream sm:flex"
        >
          <RoomSketch className="w-36" />
          <span className="flex items-center justify-between gap-3">
            Import a video
            <Arrow to="down" />
          </span>
        </a>
      </div>
    </section>
  );
}

/** The second plinth view: the room has turned a little, flanked by what it is and how it was made. */
function Reveal() {
  return (
    <section
      aria-labelledby="reveal-heading"
      className="relative flex min-h-svh flex-col bg-walnut/55 px-4 pb-10 pt-28 sm:px-6 md:pr-14 lg:bg-transparent lg:bg-[linear-gradient(to_right,rgb(16_9_4/0.88),rgb(16_9_4/0.35)_32%,transparent_42%,transparent_58%,rgb(16_9_4/0.35)_68%,rgb(16_9_4/0.88))]"
    >
      <div className="grid flex-1 grid-cols-1 content-center gap-x-4.5 gap-y-8 lg:grid-cols-12">
        <h2 id="reveal-heading" className="text-heading lg:col-span-3 lg:self-center">
          It isn&apos;t just
          <br />a video.
        </h2>
        <p className="voice text-body lg:col-span-3 lg:col-start-10 lg:self-center">
          Every room here was built on this laptop, from one phone video.
        </p>
      </div>
      <ol aria-label="How a video becomes a room" className="grid grid-cols-2 gap-x-4.5 gap-y-6 lg:grid-cols-4">
        {PIPELINE.map(({ step, tool }) => (
          <li key={tool} className="rule flex flex-col gap-2 bg-walnut/40 pt-4">
            <span className="text-label">{step}</span>
            <span className="text-label text-ember">{tool}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RoomsList({ rooms, onOpen }: { rooms: RoomSummary[] | null | undefined; onOpen: (id: string) => void }) {
  return (
    <section id="rooms" aria-labelledby="rooms-heading" className="flex min-h-svh flex-col bg-walnut px-4 pt-28 sm:px-6 md:pr-14">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-10">
        <h2 id="rooms-heading" className="text-heading">
          Your rooms.
        </h2>
        {rooms && rooms.length > 0 && <p className="text-label text-cream/70">{`${pad(rooms.length)} on this laptop`}</p>}
      </div>
      {rooms === undefined && <p className="rule pt-6 text-ui text-cream/70">Loading your rooms…</p>}
      {rooms === null && <p className="rule pt-6 text-ui">Couldn&apos;t load the rooms on this laptop.</p>}
      {rooms?.length === 0 && (
        <p className="rule pt-6 text-ui">
          No rooms yet.{' '}
          <a href="#import" onClick={(e) => goTo(e, 'import')} className="text-link">
            Import a video
          </a>{' '}
          to make one.
        </p>
      )}
      {rooms && rooms.length > 0 && (
        <ul className="flex flex-col gap-10">
          {byDay(rooms).map(({ day, entries }) => (
            <li key={day}>
              <h3 className="pb-3 text-label text-cream/70">{day}</h3>
              <ul className="flex flex-col">
                {entries.map(({ room, serial }) => (
                  <li key={room.id} className="rule">
                    <button
                      onClick={() => onOpen(room.id)}
                      aria-label={`Enter the room from ${roomLabel(room)}`}
                      className="group grid w-full grid-cols-[3rem_1fr_auto] items-center gap-x-4.5 py-5 text-left transition-colors duration-200 ease-develop hover:bg-bark/50 sm:grid-cols-[4rem_1fr_8rem_auto] sm:px-2"
                    >
                      <span className="text-label text-cream/70 tabular-nums">{pad(serial)}</span>
                      <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <span className="text-heading-sm tabular-nums">{timeOf(room)}</span>
                        <span className="text-label text-cream/70 sm:hidden">{qualityOf(room)}</span>
                      </span>
                      <span className="hidden text-label text-cream/70 sm:block">{qualityOf(room)}</span>
                      <span className="inline-flex items-center gap-3 text-label">
                        <span className="hidden sm:inline">Enter</span>
                        <Arrow to="right" className="transition-transform duration-300 ease-develop group-hover:translate-x-1" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <footer className="rule mt-auto flex flex-col gap-3 py-8 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-label text-ember">Built with ffmpeg, COLMAP, OpenSplat and Spark, after Memento</p>
        <p className="font-[Arial,sans-serif] text-[8px] leading-[1.2]">Your video is sent to this laptop to build the room, and stays there.</p>
      </footer>
    </section>
  );
}

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

  if (openRoom) {
    const shown = rooms?.find((room) => room.id === openRoom);
    return <SplatViewer roomId={openRoom} title={shown && roomLabel(shown)} onBack={back} />;
  }

  // Served without the laptop's server (no health, no rooms): say how to start it.
  if (health === null && rooms === null) {
    return (
      <main className="darkroom flex min-h-dvh flex-col justify-between px-4 py-6 sm:px-6">
        <p className="text-ui">Room Remix</p>
        <div className="flex max-w-3xl flex-col gap-8">
          <h1 className="text-heading">The room builder isn&apos;t running.</h1>
          <p className="voice text-body">
            Start it with <code className="rounded-card bg-bark px-2 font-[inherit]">npm run demo</code>, then open
            http://localhost:8080.
          </p>
        </div>
        <p className="text-label text-ember">Built with ffmpeg, COLMAP, OpenSplat and Spark, after Memento</p>
      </main>
    );
  }

  const newest = rooms?.[0];
  return (
    <div className="darkroom min-h-dvh">
      <TopNav />
      <p
        aria-hidden
        className="pointer-events-none fixed right-3 top-1/2 z-20 hidden -translate-y-1/2 text-micro [writing-mode:vertical-rl] md:block"
      >
        {newest && rooms ? `Room Remix · No. ${pad(rooms.length)} · ${dateOf(newest)}` : 'Room Remix · Video to 3D'}
      </p>
      <main>
        {/* The hero and the reveal share the plinth, so the nav calls both of them Intro. */}
        <RoomStage id="intro" room={newest ?? null}>
          <Hero rooms={rooms} onOpen={open} />
          <Reveal />
        </RoomStage>
        <HomeImport health={health} build={build} />
        <RoomsList rooms={rooms} onOpen={open} />
      </main>
    </div>
  );
}
