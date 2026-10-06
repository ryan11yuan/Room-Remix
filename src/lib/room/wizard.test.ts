import { describe, expect, it } from 'vitest';
import { defaultRoom } from './roomState';
import type { RoomState } from './types';
import {
  readyToOpen,
  startWizard,
  stepErrors,
  stepNumber,
  wizardReducer,
  WIZARD_STEPS,
  type WizardAction,
  type WizardState,
} from './wizard';

const run = (state: WizardState, ...actions: WizardAction[]) => actions.reduce(wizardReducer, state);
const update = (change: (room: RoomState) => RoomState): WizardAction => ({ type: 'update', change });
const NEXT: WizardAction = { type: 'next' };
const BACK: WizardAction = { type: 'back' };
const setLength = (length: number) => update((r) => ({ ...r, dims: { ...r.dims, length } }));

describe('startWizard', () => {
  it('starts on the Size step with the default room, named My room', () => {
    const state = startWizard();
    expect(state.step).toBe('size');
    expect(state.room).toEqual(defaultRoom());
    expect(state.room.name).toBe('My room');
  });

  it('numbers the four steps', () => {
    expect(WIZARD_STEPS.map(stepNumber)).toEqual([1, 2, 3, 4]);
  });
});

describe('Next and Back', () => {
  it('walk through the steps in order and stop at the ends', () => {
    let state = startWizard();
    expect(wizardReducer(state, BACK)).toBe(state); // nothing before Size
    state = run(state, NEXT, NEXT, NEXT);
    expect(state.step).toBe('scan');
    expect(wizardReducer(state, NEXT)).toBe(state); // the last step opens the room instead
    expect(run(state, BACK, BACK, BACK).step).toBe('size');
  });

  it('keep every edit, on every step, through Back and Next', () => {
    const edited = run(
      startWizard(),
      update((r) => ({ ...r, name: 'Studio' })),
      setLength(5),
      NEXT,
      update((r) => ({ ...r, surfaces: { ...r.surfaces, floor: 'carpet' }, furnishing: 'full' })),
      { type: 'selectSurface', surface: 'ceiling' },
      NEXT,
      update((r) => ({ ...r, speaker: { ...r.speaker, x: 1.2, z: 0.8 } })),
    );
    const roundTrip = run(edited, BACK, BACK, NEXT, NEXT);
    expect(roundTrip.step).toBe('placement');
    expect(roundTrip.room).toEqual(edited.room);
    expect(roundTrip.surface).toBe('ceiling');
    expect(roundTrip.room).toMatchObject({ name: 'Studio', furnishing: 'full' });
    expect(roundTrip.room.dims.length).toBe(5);
    expect(roundTrip.room.surfaces.floor).toBe('carpet');
    expect(roundTrip.room.speaker).toMatchObject({ x: 1.2, z: 0.8 });
  });

  it("won't leave a step that has errors, and keeps what was typed", () => {
    const state = run(startWizard(), setLength(Number.NaN), NEXT);
    expect(state.step).toBe('size');
    expect(state.room.dims.length).toBeNaN();
    expect(stepErrors('size', state.room).map((e) => e.field)).toEqual(['dims.length']);
  });

  it('goes Back from a step with errors without losing them', () => {
    const atPlacement = run(startWizard(), NEXT, NEXT);
    const together = run(atPlacement, update((r) => ({ ...r, listener: { ...r.listener, x: 0.7, z: 1.4 } })));
    expect(stepErrors('placement', together.room)).toHaveLength(1);
    const back = run(together, BACK);
    expect(back.step).toBe('surfaces');
    expect(back.room.listener).toMatchObject({ x: 0.7, z: 1.4 });
    expect(run(back, NEXT, NEXT).step).toBe('placement'); // Surfaces has nothing wrong; Placement still does
  });

  it('pulls the speaker and listener inside a room made smaller', () => {
    const state = run(
      startWizard(),
      update((r) => ({ ...r, dims: { length: 1.5, width: 1.5, height: 2 } })),
      NEXT,
    );
    expect(state.step).toBe('surfaces');
    expect(stepErrors('placement', state.room)).toEqual([]);
    expect(state.room.listener).toMatchObject({ x: 1.2, z: 1.2, yaw: 'faceSpeaker' });
  });

  it("leaves positions alone when the size didn't push them out", () => {
    const placed = run(startWizard(), NEXT, NEXT, update((r) => ({ ...r, speaker: { ...r.speaker, x: 2.2 } })));
    expect(run(placed, BACK, BACK, NEXT).room.speaker.x).toBe(2.2);
  });
});

describe('stepErrors', () => {
  it('gives each step only its own errors', () => {
    const room: RoomState = { ...defaultRoom(), dims: { length: 40, width: 3.5, height: 2.6 } };
    expect(stepErrors('size', room).map((e) => e.field)).toEqual(['dims.length']);
    expect(stepErrors('surfaces', room)).toEqual([]);
    expect(stepErrors('placement', room)).toEqual([]);
    const misplaced: RoomState = { ...defaultRoom(), speaker: { x: 0.1, y: 1, z: 1 } };
    expect(stepErrors('size', misplaced)).toEqual([]);
    expect(stepErrors('placement', misplaced).map((e) => e.field)).toEqual(['speaker']);
  });
});

describe('readyToOpen', () => {
  it('is true only on the last step with a valid room', () => {
    expect(readyToOpen(startWizard())).toBe(false);
    const last = run(startWizard(), NEXT, NEXT, NEXT);
    expect(readyToOpen(last)).toBe(true);
    expect(readyToOpen(run(last, update((r) => ({ ...r, dims: { ...r.dims, height: 1 } }))))).toBe(false);
  });
});
