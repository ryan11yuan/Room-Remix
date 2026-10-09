/** Go to (spec 2026-10-08 §7.5): a pulse from the target that speeds up as you close in, and arrival at 1 m. */
export const ARRIVE_M = 1;
export const MAX_PULSE_S = 1.2;

/** Seconds between pulses, `d` metres from the target's footprint. */
export const pulseInterval = (d: number): number => Math.min(MAX_PULSE_S, 0.25 + 0.15 * Math.max(0, d));

export const hasArrived = (d: number): boolean => d <= ARRIVE_M;
