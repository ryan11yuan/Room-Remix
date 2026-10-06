'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useReducer, useRef, useState } from 'react';
import { browserStorage } from '@/components/browserStorage';
import { inputClass, LengthField } from '@/components/LengthField';
import { setPendingScan } from '@/components/pendingScan';
import { SurfacePicker } from '@/components/SurfacePicker';
import { Toggle } from '@/components/Toggle';
import { TopView } from '@/components/TopView';
import { useUnits } from '@/components/useUnits';
import { useWebGL } from '@/components/useWebGL';
import { FURNISHING_LABELS } from '@/lib/room/labels';
import { loadRooms, uniqueName } from '@/lib/room/rooms';
import type { Furnishing, RoomState } from '@/lib/room/types';
import { errorMessage } from '@/lib/room/units';
import { encodeRoom } from '@/lib/room/urlCodec';
import { readyToOpen, startWizard, stepErrors, stepNumber, WIZARD_STEPS, wizardReducer, type WizardStep } from '@/lib/room/wizard';

const TITLES: Record<WizardStep, string> = {
  size: 'How big is your room?',
  surfaces: 'What is each surface made of?',
  placement: 'Where are the speaker and you?',
  scan: 'Add a scan of your room (optional)',
};
const OPEN_ERROR = "Couldn't open your room. Try again.";
const buttonClass = 'min-h-11 rounded-lg border border-neutral-700 px-5 font-semibold disabled:opacity-40';
const primaryClass = 'min-h-11 rounded-lg bg-white px-5 font-semibold text-neutral-950 disabled:opacity-40';

/** Room setup: size, surfaces, placement and an optional scan. "Open my room" opens it through a share link. */
export default function SetupPage() {
  const router = useRouter();
  const [state, dispatch] = useReducer(wizardReducer, undefined, startWizard);
  const [unit, setUnit] = useUnits();
  const webgl = useWebGL();
  const [scan, setScan] = useState<File | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(state.step);
  const { step, room } = state;
  const errors = stepErrors(step, room);
  const update = (change: (r: RoomState) => RoomState) => dispatch({ type: 'update', change });
  const setDim = (key: keyof RoomState['dims'], metres: number) => update((r) => ({ ...r, dims: { ...r.dims, [key]: metres } }));

  // A new step: focus its heading, so a screen reader says where the visitor is now. Not on the first render.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    headingRef.current?.focus();
  }, [step]);

  async function openRoom() {
    setOpening(true);
    setOpenError(null);
    // A name no saved room has: the room then always opens as a new one, never as an identical saved room.
    const name = room.name.trim() ? uniqueName(loadRooms(browserStorage()), room.name) : room.name;
    try {
      const code = await encodeRoom({ ...room, name });
      setPendingScan(scan ? { file: scan, link: code } : null);
      router.push('/room#' + code);
    } catch {
      setOpenError(OPEN_ERROR);
      setOpening(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="inline-flex min-h-11 items-center underline">
          Room Remix
        </Link>
        <p className="text-neutral-400">
          Step {stepNumber(step)} of {WIZARD_STEPS.length}
        </p>
      </header>
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none">
        {TITLES[step]}
      </h1>

      {step === 'size' && (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-400">Room name</span>
            <input
              value={room.name}
              maxLength={80}
              placeholder="Untitled room"
              onChange={(e) => update((r) => ({ ...r, name: e.target.value }))}
              className={inputClass}
            />
          </label>
          <Toggle label="Units" options={['Metres', 'Feet']} value={unit === 'ft'} onChange={(feet) => setUnit(feet ? 'ft' : 'm')} />
          <div className="flex flex-wrap gap-3">
            <LengthField label="Length" metres={room.dims.length} unit={unit} onChange={(v) => setDim('length', v)} />
            <LengthField label="Width" metres={room.dims.width} unit={unit} onChange={(v) => setDim('width', v)} />
            <LengthField label="Ceiling height" metres={room.dims.height} unit={unit} onChange={(v) => setDim('height', v)} />
          </div>
          <p className="text-sm text-neutral-400">Measure wall to wall. Rough numbers are fine: you can change them later.</p>
        </div>
      )}

      {step === 'surfaces' && (
        <div className="flex flex-col gap-6">
          <SurfacePicker
            room={room}
            selected={state.surface}
            onSelect={(surface) => dispatch({ type: 'selectSurface', surface })}
            onMaterial={(surface, material) => update((r) => ({ ...r, surfaces: { ...r.surfaces, [surface]: material } }))}
          />
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-2 text-sm font-semibold">How much furniture is in it?</legend>
            {(Object.keys(FURNISHING_LABELS) as Furnishing[]).map((furnishing) => (
              <label key={furnishing} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="furnishing"
                  checked={room.furnishing === furnishing}
                  onChange={() => update((r) => ({ ...r, furnishing }))}
                />
                {FURNISHING_LABELS[furnishing]}
              </label>
            ))}
          </fieldset>
        </div>
      )}

      {step === 'placement' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-neutral-300">
            Drag the speaker (orange) and the listener (blue) to where they are, or select one and use the arrow keys.
            The listener faces the speaker.
          </p>
          <TopView room={room} onChange={update} unit={unit} label="Your room from above" />
          <p className="text-sm text-neutral-400">You can set their heights, and try a rug or panels, once the room is open.</p>
        </div>
      )}

      {step === 'scan' && (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-neutral-300">
            If you&apos;ve scanned this room with an app such as Scaniverse or Polycam, add the .ply, .spz or .splat file
            it exported. You&apos;ll line it up with the room in the 3D view. The file stays on your device.
          </p>
          {webgl ? (
            <>
              <label className="inline-flex min-h-11 cursor-pointer items-center self-start rounded-lg border border-neutral-700 px-5 font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-neutral-300">
                {scan ? 'Choose another scan' : 'Choose a scan'}
                <input
                  type="file"
                  accept=".ply,.spz,.splat,.ksplat"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = ''; // so picking the same file again still fires
                    if (file) setScan(file);
                  }}
                />
              </label>
              {scan && (
                <p className="flex items-center gap-3">
                  <span className="min-w-0 truncate">{scan.name}</span>
                  <button type="button" onClick={() => setScan(null)} className="min-h-11 shrink-0 px-2 underline">
                    Remove
                  </button>
                </p>
              )}
            </>
          ) : (
            <p className="text-neutral-400">This browser can&apos;t show 3D, so a scan can&apos;t be used here.</p>
          )}
          <p className="text-neutral-400">No scan? Open your room now. You can add one later from the 3D view.</p>
        </div>
      )}

      {/* Mounted all the time, so a screen reader announces an error when it appears. */}
      <div role="status" className="empty:sr-only">
        {errors.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
            {errors.map((e) => (
              <li key={`${e.field}:${e.message}`}>{errorMessage(e, unit)}</li>
            ))}
          </ul>
        )}
      </div>

      <nav aria-label="Setup steps" className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => dispatch({ type: 'back' })} disabled={step === 'size'} className={buttonClass}>
          Back
        </button>
        {step === 'scan' ? (
          <button type="button" onClick={() => void openRoom()} disabled={opening || !readyToOpen(state)} className={primaryClass}>
            {opening ? 'Opening…' : 'Open my room'}
          </button>
        ) : (
          <button type="button" onClick={() => dispatch({ type: 'next' })} disabled={errors.length > 0} className={primaryClass}>
            Next
          </button>
        )}
      </nav>
      <p role="alert" className="text-sm text-red-400 empty:sr-only">
        {openError}
      </p>
    </main>
  );
}
