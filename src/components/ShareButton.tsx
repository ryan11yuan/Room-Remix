'use client';

import { useEffect, useRef, useState } from 'react';
import { validateRoom } from '@/lib/room/roomState';
import { useRoomStore } from '@/lib/room/store';
import type { RoomState } from '@/lib/room/types';
import { encodeRoom } from '@/lib/room/urlCodec';

const PREPARE_MS = 300; // the room changes on every drag frame: make the link once it settles
const COPIED_MS = 3000;
const linkFor = (code: string) => `${window.location.origin}${window.location.pathname}#${code}`;

export function ShareButton() {
  const room = useRoomStore((s) => s.room);
  const valid = validateRoom(room).length === 0;
  // The link for `room`, made ahead of the click: Safari only lets a click copy when nothing is awaited first.
  const [prepared, setPrepared] = useState<{ room: RoomState; code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [manualLink, setManualLink] = useState<string | null>(null); // shown to copy by hand when the browser won't copy
  const [unsupported, setUnsupported] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const manualInput = useRef<HTMLInputElement>(null);
  const shareButton = useRef<HTMLButtonElement>(null);

  // The copy-by-hand field takes focus with its link selected, ready for Ctrl+C or the phone's Copy.
  useEffect(() => {
    if (!manualLink) return;
    manualInput.current?.focus();
    manualInput.current?.select();
  }, [manualLink]);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    const wait = setTimeout(() => {
      void encodeRoom(room).then(
        (code) => {
          if (!cancelled) setPrepared({ room, code });
        },
        () => {}, // no link can be made in this browser: a click says so
      );
    }, PREPARE_MS);
    return () => {
      cancelled = true;
      clearTimeout(wait);
    };
  }, [room, valid]);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  function copy(code: string) {
    const link = linkFor(code);
    const showCopied = () => {
      setManualLink(null);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    };
    // navigator.clipboard (or its writeText) is missing on plain-http pages, and the write is refused without permission.
    let written: Promise<void> | undefined;
    try {
      written = navigator.clipboard?.writeText?.(link);
    } catch {
      written = undefined;
    }
    if (written) written.then(showCopied, () => setManualLink(link));
    else setManualLink(link);
  }

  function share() {
    if (prepared?.room === room) copy(prepared.code);
    else void encodeRoom(room).then(copy, () => setUnsupported(true)); // clicked before the link was ready
  }

  return (
    <div className="relative">
      <button ref={shareButton} onClick={share} disabled={!valid} className="min-h-11 rounded-lg border border-neutral-700 px-4 text-sm disabled:opacity-40">
        {unsupported ? "Sharing isn't supported in this browser" : copied ? 'Link copied' : 'Share link'}
      </button>
      <span role="status" className="sr-only">
        {copied ? 'Link copied' : unsupported ? "Sharing isn't supported in this browser" : ''}
      </span>
      {manualLink && (
        <div className="absolute right-0 top-full z-10 mt-2 flex w-72 flex-col gap-2 rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-sm">
          <label className="flex flex-col gap-1">
            <span>Copy this link:</span>
            <input
              ref={manualInput}
              readOnly
              value={manualLink}
              onFocus={(e) => e.target.select()}
              className="min-h-11 rounded-md border border-neutral-700 bg-neutral-950 px-2"
            />
          </label>
          <button
            onClick={() => {
              setManualLink(null);
              shareButton.current?.focus(); // focus goes back where it came from, not to the page's start
            }}
            className="min-h-11 self-end rounded-md border border-neutral-700 px-3"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
