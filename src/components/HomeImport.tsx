'use client';

import { useEffect, useId, useState, type DragEvent } from 'react';
import { FILMING_TIPS, jobFraction, jobLine, KEEP_SCREEN_ON, LOST_CONTACT, NOT_RUNNING } from '@/lib/splatJobs/panel';
import type { Health, JobView, Quality } from '@/lib/splatJobs/protocol';
import { Arrow } from './Arrow';
import type { useVideoScan } from './useVideoScan';

type Build = ReturnType<typeof useVideoScan>;

const QUALITIES: readonly { value: Quality; name: string; detail: string }[] = [
  { value: 'quick', name: 'Quick', detail: 'About 5 minutes' },
  { value: 'best', name: 'Best', detail: 'Sharper, about half an hour' },
];

/** What to do when the builder can't run, by what the laptop reported. */
const FIX: Record<Exclude<Health['pipeline'], 'ready'>, string> = {
  'no-docker': 'Start Docker Desktop, then reload this page.',
  'no-image': 'Build the pipeline once with npm run pipeline:build, then reload this page.',
};

/** The pipeline's steps in the order a build reports them, so the page can show how far along it is. */
const STEPS: readonly { state: JobView['state']; name: string }[] = [
  { state: 'checking', name: 'Check the video' },
  { state: 'frames', name: 'Pull frames' },
  { state: 'cameras', name: 'Find camera positions' },
  { state: 'training', name: 'Build the room' },
];

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;

function Bar({ fraction, label }: { fraction: number | null; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={fraction === null ? undefined : 0}
      aria-valuemax={fraction === null ? undefined : 100}
      aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}
      className="h-0.5 w-full overflow-hidden bg-cork"
    >
      {fraction === null ? (
        // No measurement yet: a partial bar that slides, so a working build doesn't look stuck. Still under reduced motion.
        <div className="h-full w-1/3 bg-cream motion-safe:animate-[indeterminate_1.6s_ease-in-out_infinite]" />
      ) : (
        <div className="h-full bg-cream transition-[width] duration-500 ease-develop" style={{ width: percent(fraction) }} />
      )}
    </div>
  );
}

function Steps({ job }: { job: JobView }) {
  const at = STEPS.findIndex((step) => step.state === job.state);
  return (
    <ol aria-label="Steps" className="flex flex-col">
      {STEPS.map((step, i) => {
        const done = at > i;
        const now = at === i;
        return (
          <li
            key={step.state}
            aria-current={now ? 'step' : undefined}
            className={`rule flex items-center gap-4 py-3 text-label ${now ? '' : done ? 'text-cream/70' : 'text-cream/60'}`}
          >
            <span
              aria-hidden
              className={`size-2 shrink-0 rounded-full border border-current ${done ? 'bg-current' : ''} ${now ? 'bg-cream motion-safe:animate-pulse' : ''}`}
            />
            <span className="flex-1">{step.name}</span>
            {done && <span className="text-micro">Done</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** The import's controls and progress, by the build's state. */
function Controls({ health, build }: { health: Health | null | undefined; build: Build }) {
  const [quality, setQuality] = useState<Quality>('quick');
  const group = useId();
  const { state } = build;

  if (state.kind === 'uploading') {
    return (
      <div className="flex flex-col gap-6">
        <div role="status" className="flex flex-col gap-3">
          <p className="text-display tabular-nums lg:text-[96px]">{percent(state.fraction)}</p>
          <p className="text-ui">Uploading the video</p>
        </div>
        <Bar fraction={state.fraction} label="Upload" />
        <p className="voice text-sub text-cream/70">{KEEP_SCREEN_ON}</p>
        <button onClick={build.cancel} className="ghost self-start">
          Cancel
        </button>
      </div>
    );
  }
  if (state.kind === 'building') {
    const fraction = jobFraction(state.job);
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          {fraction !== null && <p className="text-display tabular-nums lg:text-[96px]">{percent(fraction)}</p>}
          <p role="status" className="text-heading-sm">
            {jobLine(state.job)}
          </p>
          {state.offline && <p className="text-ui text-cream/70">{LOST_CONTACT}</p>}
        </div>
        <Bar fraction={fraction} label="Building your room" />
        <Steps job={state.job} />
        <button onClick={build.cancel} className="ghost self-start">
          Cancel
        </button>
      </div>
    );
  }
  if (state.kind === 'downloading') {
    return (
      <div className="flex flex-col gap-6">
        <p role="status" className="text-heading-sm">
          Getting your room from the laptop…
        </p>
        <Bar fraction={null} label="Getting your room" />
      </div>
    );
  }
  if (state.kind === 'failed') {
    return (
      <div className="flex flex-col gap-6 rounded-card border border-cork p-6">
        <p role="status" className="text-heading-sm">
          {state.message}
        </p>
        {state.tips && <p className="voice text-sub text-cream/70">Film it again following the tips on how to film.</p>}
        <div className="flex flex-wrap gap-3">
          {state.retry && (
            <button onClick={build.retry} className="pill">
              Try again
            </button>
          )}
          <button onClick={build.dismiss} className="ghost">
            Close
          </button>
        </div>
      </div>
    );
  }

  if (health === undefined) {
    return (
      <p role="status" className="text-ui text-cream/70">
        Checking the room builder…
      </p>
    );
  }
  if (!health || health.pipeline !== 'ready') {
    return (
      <div className="flex flex-col gap-3 rounded-card border border-cork p-6">
        <p className="text-heading-sm">{NOT_RUNNING}</p>
        {health && health.pipeline !== 'ready' && <p className="voice text-sub text-cream/70">{FIX[health.pipeline]}</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <legend className="sr-only">Quality</legend>
        {QUALITIES.map((q) => (
          <label
            key={q.value}
            className="group flex min-h-11 cursor-pointer flex-col gap-3 rounded-card border border-cork p-5 transition-colors duration-200 ease-develop hover:border-driftwood has-checked:border-cream has-checked:bg-bark has-focus-visible:outline-1 has-focus-visible:outline-offset-3 has-focus-visible:outline-cream"
          >
            <input
              type="radio"
              name={group}
              value={q.value}
              checked={quality === q.value}
              onChange={() => setQuality(q.value)}
              className="sr-only"
            />
            <span className="flex items-center justify-between text-ui">
              {q.name}
              <span aria-hidden className="size-3 rounded-full border border-cream group-has-checked:bg-cream" />
            </span>
            <span className="voice text-sub text-cream/70">{q.detail}</span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <label className="pill cursor-pointer has-focus-visible:outline-1 has-focus-visible:outline-offset-3 has-focus-visible:outline-cream">
          Import a video
          <Arrow to="right" />
          <input
            type="file"
            accept="video/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ''; // so picking the same file again still fires
              if (file) build.start(file, quality);
            }}
          />
        </label>
        <p className="hidden text-label text-cream/70 pointer-fine:block">Or drop one on this page</p>
      </div>
      <DropTarget onDrop={(file) => build.start(file, quality)} />
    </div>
  );
}

/** While a file is dragged over the window, the whole viewport becomes the place to drop it. */
function DropTarget({ onDrop }: { onDrop: (file: File) => void }) {
  const [over, setOver] = useState(false);
  useEffect(() => {
    const raise = (e: globalThis.DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) setOver(true);
    };
    // A file dropped anywhere else would make the browser open the video in place of the page.
    const keepPage = (e: globalThis.DragEvent) => e.preventDefault();
    window.addEventListener('dragenter', raise);
    window.addEventListener('dragover', keepPage);
    window.addEventListener('drop', keepPage);
    return () => {
      window.removeEventListener('dragenter', raise);
      window.removeEventListener('dragover', keepPage);
      window.removeEventListener('drop', keepPage);
    };
  }, []);
  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-40 p-4 transition-opacity duration-200 sm:p-6 ${over ? '' : 'pointer-events-none opacity-0'}`}
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onDrop(file);
      }}
    >
      <div className="flex h-full items-center justify-center rounded-card border border-dashed border-cream bg-walnut/90">
        <p className="text-heading">Drop to import</p>
      </div>
    </div>
  );
}

/** The import section: a video in, a room out. The tips sit beside the controls so they're read before filming. */
export function HomeImport({ health, build }: { health: Health | null | undefined; build: Build }) {
  return (
    <section
      id="import"
      aria-labelledby="import-heading"
      className="relative grid min-h-svh grid-cols-1 content-center gap-x-4.5 gap-y-16 bg-walnut px-4 py-28 sm:px-6 md:pr-14 lg:grid-cols-12"
    >
      <div className="flex flex-col gap-10 lg:col-span-6">
        <h2 id="import-heading" className="text-heading">
          Import a video.
        </h2>
        <p className="voice max-w-[24ch] text-body">Film one slow lap of the room, then bring the video here. The laptop builds the rest.</p>
        <Controls health={health} build={build} />
      </div>
      <div className="flex flex-col lg:col-span-5 lg:col-start-8 lg:self-start lg:pt-2">
        <h3 className="pb-5 text-ui">How to film</h3>
        <ul className="flex flex-col">
          {FILMING_TIPS.map((tip) => (
            <li key={tip} className="rule voice py-5 text-sub">
              {tip}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
