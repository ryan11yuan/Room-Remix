'use client';

import { useId, useState } from 'react';
import { jobFraction, jobLine, KEEP_SCREEN_ON, LOST_CONTACT, type VideoScanState } from '@/lib/splatJobs/panel';
import type { Quality } from '@/lib/splatJobs/protocol';

const buttonClass = 'inline-flex min-h-11 items-center rounded-md border border-neutral-700 px-3 disabled:opacity-40';
const TIPS = 'Walk slowly around the room for 30–60 seconds. Move sideways rather than turning on the spot, and keep the light good.';
const PRIVACY = 'Your video is sent to this laptop to build the room, and stays there.';
const QUALITY_LABELS: Record<Quality, string> = { quick: 'Quick: about 5 minutes', best: 'Best: sharper, about half an hour' };

function Bar({ fraction, label }: { fraction: number | null; label: string }) {
  if (fraction === null) {
    // No measurement yet: a partial bar that slides, so a working build doesn't look stuck. Still under reduced motion.
    return (
      <div role="progressbar" aria-label={label} className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
        <div className="h-full w-1/3 rounded-full bg-sky-400 motion-safe:animate-[indeterminate_1.6s_ease-in-out_infinite]" />
      </div>
    );
  }
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      className="h-2 w-full overflow-hidden rounded-full bg-neutral-800"
    >
      <div className="h-full bg-sky-400" style={{ width: `${fraction * 100}%` }} />
    </div>
  );
}

/** Opened by "Make from a video": the tips, Quick or Best, and the video; then the upload's progress. */
export function VideoScanPanel({
  state,
  onStart,
  onCancel,
}: {
  state: Extract<VideoScanState, { kind: 'idle' | 'uploading' }>;
  onStart: (file: File, quality: Quality) => void;
  onCancel: () => void;
}) {
  const [quality, setQuality] = useState<Quality>('quick');
  const group = useId();
  return (
    <section aria-label="Make a scan from a video" className="flex flex-col gap-3 rounded-lg border border-neutral-800 p-3 text-sm">
      <p className="text-neutral-300">{TIPS}</p>
      {state.kind === 'idle' ? (
        <>
          <fieldset className="flex flex-wrap gap-x-4">
            <legend className="sr-only">Quality</legend>
            {(['quick', 'best'] as const).map((q) => (
              <label key={q} className="inline-flex min-h-11 items-center gap-2">
                <input type="radio" name={group} checked={quality === q} onChange={() => setQuality(q)} />
                {QUALITY_LABELS[q]}
              </label>
            ))}
          </fieldset>
          <p className="text-neutral-400">{PRIVACY}</p>
          <label
            className={`${buttonClass} cursor-pointer self-start has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-neutral-300`}
          >
            Choose or record a video
            <input
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = ''; // so picking the same file again still fires
                if (file) onStart(file, quality);
              }}
            />
          </label>
        </>
      ) : (
        <>
          <p role="status" className="text-neutral-300">{`Uploading ${Math.round(state.fraction * 100)}%`}</p>
          <Bar fraction={state.fraction} label="Upload" />
          <p className="text-amber-200">{KEEP_SCREEN_ON}</p>
          <button onClick={onCancel} className={`${buttonClass} self-start`}>
            Cancel
          </button>
        </>
      )}
    </section>
  );
}

/** Under the "Room scan" row while a build runs, downloads or has failed. */
export function VideoScanProgress({
  state,
  onCancel,
  onDismiss,
  onRetry,
}: {
  state: Extract<VideoScanState, { kind: 'building' | 'downloading' | 'failed' }>;
  onCancel: () => void;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  if (state.kind === 'failed') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p role="status" className="min-w-0 flex-1 text-amber-200">
          {state.message}
        </p>
        {state.retry && (
          <button onClick={onRetry} className={buttonClass}>
            Try again
          </button>
        )}
        <button onClick={onDismiss} className={buttonClass}>
          Close
        </button>
      </div>
    );
  }
  if (state.kind === 'downloading') {
    return (
      <p role="status" className="text-sm text-neutral-300">
        Getting your room from the laptop…
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p role="status" className="min-w-0 flex-1 text-neutral-300">
          {jobLine(state.job)}
          {state.offline && <span className="text-amber-200">{` · ${LOST_CONTACT}`}</span>}
        </p>
        <button onClick={onCancel} className={buttonClass}>
          Cancel
        </button>
      </div>
      <Bar fraction={jobFraction(state.job)} label="Building your room" />
    </div>
  );
}
