'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelJob, downloadSplat, fetchJob, uploadVideo } from '@/lib/splatJobs/client';
import { buildFailure, DOWNLOAD_FAILED, GONE, OFFLINE_POLL_MS, POLL_MS, uploadFailMessage, type VideoScanState } from '@/lib/splatJobs/panel';
import type { Quality } from '@/lib/splatJobs/protocol';
import { forgetJob, recallJob, rememberJob } from '@/lib/splatJobs/remembered';

/**
 * Builds a room scan from a video on the demo laptop (spec 2026-10-06 §6). `onReady(file, roomId, jobId)` gets the finished
 * splat for the room its build belongs to. Builds are remembered per room: a reload, or coming back to the room, picks
 * one up again, and one that finished while its room wasn't open is fetched then.
 */
export function useVideoScan(roomId: string | null, onReady: (file: File, roomId: string, jobId: string) => void) {
  const [state, setState] = useState<VideoScanState>({ kind: 'idle' });
  const [follow, setFollow] = useState(0); // bumped to (re)start following this room's remembered build
  const upload = useRef<{ abort(): void } | null>(null);
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current = onReady;
  }, [onReady]);

  // Another room: what was shown belonged to the last one, whose build keeps running on the laptop.
  const [shownRoom, setShownRoom] = useState(roomId);
  if (roomId !== shownRoom) {
    setShownRoom(roomId);
    setState({ kind: 'idle' });
  }

  // An upload belongs to the room it started in: leaving the room (or the page) stops it.
  useEffect(
    () => () => {
      upload.current?.abort();
      upload.current = null;
    },
    [roomId],
  );

  // Follows this room's remembered build until it finishes.
  useEffect(() => {
    if (!roomId) return;
    const room = roomId;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const id = recallJob(room);
      if (!id) return;
      const result = await fetchJob(id);
      if (!live) return;
      if (result.kind === 'gone') {
        forgetJob(room);
        setState({ kind: 'failed', message: GONE });
        return;
      }
      if (result.kind === 'offline') {
        setState((shown) =>
          shown.kind === 'building' ? { ...shown, offline: true } : { kind: 'building', job: { id, quality: 'quick', state: 'queued' }, offline: true },
        );
        timer = setTimeout(() => void poll(), OFFLINE_POLL_MS);
        return;
      }
      const { job } = result;
      if (job.state === 'ready') {
        setState({ kind: 'downloading' });
        try {
          const file = await downloadSplat(id);
          if (!live) return; // still remembered: fetched again when this room is next open
          forgetJob(room);
          setState({ kind: 'idle' });
          ready.current(file, room, id);
        } catch {
          if (live) setState({ kind: 'failed', message: DOWNLOAD_FAILED, retry: true });
        }
        return;
      }
      if (job.state === 'failed' || job.state === 'canceled') {
        forgetJob(room);
        setState(job.state === 'failed' ? buildFailure(job) : { kind: 'idle' });
        return;
      }
      setState({ kind: 'building', job, offline: false });
      timer = setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [roomId, follow]);

  const start = useCallback(
    (file: File, quality: Quality) => {
      if (!roomId || upload.current) return;
      const room = roomId;
      setState({ kind: 'uploading', fraction: 0 });
      const sending = uploadVideo(file, quality, (fraction) => {
        if (upload.current === sending) setState({ kind: 'uploading', fraction });
      });
      upload.current = sending;
      void sending.done.then((result) => {
        if (upload.current !== sending) return; // canceled, or the room was left
        upload.current = null;
        if (!result.ok) {
          setState(result.reason === 'aborted' ? { kind: 'idle' } : { kind: 'failed', message: uploadFailMessage(result.reason) });
          return;
        }
        rememberJob(room, result.job.id);
        setState({ kind: 'building', job: result.job, offline: false });
        setFollow((n) => n + 1);
      });
    },
    [roomId],
  );

  const cancel = useCallback(() => {
    const sending = upload.current;
    if (sending) {
      upload.current = null;
      sending.abort();
      setState({ kind: 'idle' });
      return;
    }
    if (!roomId) return;
    const id = recallJob(roomId);
    forgetJob(roomId);
    if (id) void cancelJob(id);
    setState({ kind: 'idle' });
    setFollow((n) => n + 1); // the follow loop stops: nothing is remembered now
  }, [roomId]);

  /** Closes a failure message; a build whose splat couldn't be fetched is given up on. */
  const dismiss = useCallback(() => {
    if (roomId) forgetJob(roomId);
    setState({ kind: 'idle' });
  }, [roomId]);

  /** After a failed download: fetch the remembered build again. */
  const retry = useCallback(() => {
    setState({ kind: 'idle' });
    setFollow((n) => n + 1);
  }, []);

  return { state, start, cancel, dismiss, retry };
}
