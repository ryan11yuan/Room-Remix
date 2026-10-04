'use client';

import { useEffect, useRef, useState } from 'react';
import { AcousticsClient, type SimOutput } from '@/lib/acoustics/client';
import { validateRoom } from '@/lib/room/roomState';
import type { RoomState } from '@/lib/room/types';

export type SimState = {
  status: 'idle' | 'running' | 'ready' | 'error';
  result: SimOutput | null;
  error: string | null;
};

const DEBOUNCE_MS = 150;

/** Re-simulates the room in a worker 150 ms after it stops changing. Keeps the last good result on failure. */
export function useSimulation(room: RoomState, sampleRate: number | null): SimState {
  const clientRef = useRef<AcousticsClient | null>(null);
  const [state, setState] = useState<SimState>({ status: 'idle', result: null, error: null });

  useEffect(() => {
    const client = new AcousticsClient();
    clientRef.current = client;
    return () => {
      client.dispose();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (sampleRate === null || validateRoom(room).length > 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const client = clientRef.current;
      if (!client) return;
      setState((s) => ({ ...s, status: 'running' }));
      client.simulate(room, sampleRate).then(
        (result) => {
          if (!cancelled) setState({ status: 'ready', result, error: null });
        },
        (error: Error) => {
          if (!cancelled) setState((s) => ({ status: 'error', result: s.result, error: error.message }));
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [room, sampleRate]);

  return state;
}
