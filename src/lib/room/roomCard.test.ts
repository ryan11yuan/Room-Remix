import { describe, expect, it } from 'vitest';
import { predictRt60 } from '@/lib/acoustics/simulate';
import { describeRoom, roomCardFor, TARGET_NOTE } from './roomCard';
import { defaultRoom } from './roomState';
import type { RoomState } from './types';

describe('describeRoom', () => {
  it('describes a room with no fixes on', () => {
    expect(describeRoom(0.62, null)).toEqual({
      now: 'Reverb time now: 0.62 s',
      withFixes: null,
      rating: 'A bit echoey',
      target: TARGET_NOTE,
      measured: null,
      summary: '0.62 s · A bit echoey',
    });
  });

  it('shows what the fixes change', () => {
    const card = describeRoom(0.62, 0.41);
    expect(card.withFixes).toBe('With fixes: 0.41 s');
    expect(card.rating).toBe('A bit echoey → Balanced');
    expect(card.summary).toBe('0.62 → 0.41 s · A bit echoey → Balanced');
  });

  it("gives one rating when the fixes don't change it", () => {
    expect(describeRoom(0.95, 0.85).rating).toBe('Echoey');
  });

  it('shows a measurement only when there is one', () => {
    expect(describeRoom(0.62, null, 0.58).measured).toBe('Measured: 0.58 s');
    expect(describeRoom(0.62, null).measured).toBeNull();
    expect(describeRoom(0.62, null, Number.NaN).measured).toBeNull();
  });

  it('names the target', () => {
    expect(TARGET_NOTE).toBe('Living rooms and bedrooms sound best at 0.3–0.5 s.');
  });
});

describe('roomCardFor', () => {
  const withRug = (on: boolean): RoomState => ({ ...defaultRoom(), fixes: [{ kind: 'rug', size: 'L', x: 2, z: 1.75, on }] });

  it("predicts the room's reverb time", () => {
    const card = roomCardFor(defaultRoom())!;
    expect(card.now).toBe(`Reverb time now: ${predictRt60(defaultRoom()).mid.toFixed(2)} s`);
    expect(card.withFixes).toBeNull();
  });

  it('compares with fixes only when a fix is on', () => {
    expect(roomCardFor(withRug(false))!.withFixes).toBeNull();
    const card = roomCardFor(withRug(true))!;
    expect(card.withFixes).toBe(`With fixes: ${predictRt60(withRug(true)).mid.toFixed(2)} s`);
    expect(predictRt60(withRug(true)).mid).toBeLessThan(predictRt60(defaultRoom()).mid);
  });

  it('includes a clap measurement', () => {
    const measured: RoomState = { ...defaultRoom(), calibration: { factor: 1.1, measuredRt60: 0.7 } };
    expect(roomCardFor(measured)!.measured).toBe('Measured: 0.70 s');
  });

  it('gives no card while the room has errors', () => {
    expect(roomCardFor({ ...defaultRoom(), dims: { length: 0, width: 3, height: 2.4 } })).toBeNull();
  });
});
