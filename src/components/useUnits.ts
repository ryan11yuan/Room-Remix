'use client';

import { useSyncExternalStore } from 'react';
import { defaultUnit, parseUnit, UNITS_KEY, type Unit } from '@/lib/room/units';
import { browserStorage } from './browserStorage';

let chosen: Unit | null = null; // this page's choice: it holds even where storage can't keep it
const listeners = new Set<() => void>();

function readUnit(): Unit {
  if (chosen) return chosen;
  let stored: string | null = null;
  try {
    stored = browserStorage()?.getItem(UNITS_KEY) ?? null;
  } catch {
    stored = null; // blocked storage: fall back to the language
  }
  return parseUnit(stored) ?? defaultUnit(navigator.language);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== UNITS_KEY && event.key !== null) return;
    chosen = null; // another tab chose: read it
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Show lengths in `unit` from now on, in every field on the page, and remember it in this browser. */
export function setUnit(unit: Unit): void {
  chosen = unit;
  try {
    browserStorage()?.setItem(UNITS_KEY, unit);
  } catch {
    // kept for this page only
  }
  listeners.forEach((listener) => listener());
}

/** The unit lengths are shown in, and its setter. Metres while prerendering; the browser's choice after hydration. */
export function useUnits(): [Unit, (unit: Unit) => void] {
  const unit = useSyncExternalStore(subscribe, readUnit, () => 'm' as const);
  return [unit, setUnit];
}
