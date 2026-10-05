'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AcousticsClient, SUPERSEDED, type SimOutput } from '@/lib/acoustics/client';
import { validateRoom } from '@/lib/room/roomState';
import type { RoomState } from '@/lib/room/types';

/** Simulate before any song is picked; the page re-simulates if the audio context runs at another rate. */
export const DEFAULT_SAMPLE_RATE = 48000;

export type SimState = {
  status: 'idle' | 'running' | 'ready' | 'error';
  result: SimOutput | null;
  error: string | null;
};
export type Simulation = SimState & { retry: () => void };

const DEBOUNCE_MS = 150;

/** True when the result was simulated at the audio context's rate, so its IRs can be loaded into it. */
export function resultMatchesRate(result: SimOutput | null, sampleRate: number | null): result is SimOutput {
  return result !== null && sampleRate !== null && result.now.ir.sampleRate === sampleRate;
}

/** Re-simulates the room in a worker 150 ms after it stops changing. Keeps the last good result on failure. */
export function useSimulation(room: RoomState, sampleRate: number): Simulation {
  const clientRef = useRef<AcousticsClient | null>(null);
  const [state, setState] = useState<SimState>({ status: 'idle', result: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const client = new AcousticsClient();
    clientRef.current = client;
    return () => {
      client.dispose();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    const valid = validateRoom(room).length === 0;
    let cancelled = false;
    const timer = setTimeout(() => {
      const client = clientRef.current;
      if (!valid || !client) {
        setState((s) => (s.status === 'running' ? { ...s, status: s.result ? 'ready' : 'idle' } : s));
        return;
      }
      setState((s) => ({ ...s, status: 'running' }));
      client.simulate(room, sampleRate).then(
        (result) => {
          if (!cancelled) setState({ status: 'ready', result, error: null });
        },
        (error: Error) => {
          if (!cancelled && error.message !== SUPERSEDED) {
            setState((s) => ({ status: 'error', result: s.result, error: error.message }));
          }
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [room, sampleRate, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
