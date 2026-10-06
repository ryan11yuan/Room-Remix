import { clampPosition } from './placement';
import { defaultRoom, validateRoom, type RoomError } from './roomState';
import type { RoomState, SurfaceId } from './types';

/** The setup wizard's steps, in order. (Plan 2 adds a clap step between placement and scan.) */
export const WIZARD_STEPS = ['size', 'surfaces', 'placement', 'scan'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** Everything the wizard holds: the step, the room being set up, and the surface picked on the Surfaces step. */
export type WizardState = { step: WizardStep; room: RoomState; surface: SurfaceId };

export type WizardAction =
  | { type: 'update'; change: (room: RoomState) => RoomState }
  | { type: 'selectSurface'; surface: SurfaceId }
  | { type: 'next' }
  | { type: 'back' };

/** Which validation fields each step owns. */
const STEP_FIELDS: Record<WizardStep, (field: string) => boolean> = {
  size: (field) => field.startsWith('dims.'),
  surfaces: () => false,
  placement: (field) => field === 'speaker' || field === 'listener',
  scan: () => false,
};

/** The wizard's first state: the Size step, on the app's default room ("My room"). */
export function startWizard(): WizardState {
  return { step: 'size', room: defaultRoom(), surface: 'floor' };
}

/** The step's number, from 1: "Step 2 of 4". */
export function stepNumber(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step) + 1;
}

/** The room's validation errors that belong to this step. */
export function stepErrors(step: WizardStep, room: RoomState): RoomError[] {
  return validateRoom(room).filter((error) => STEP_FIELDS[step](error.field));
}

/** Whether the wizard can open its room: on the last step, with nothing wrong anywhere. */
export function readyToOpen(state: WizardState): boolean {
  return state.step === 'scan' && validateRoom(state.room).length === 0;
}

/** Keep the speaker and listener inside a room that was just resized: 0.3 m from every surface. */
export function fitPositions(room: RoomState): RoomState {
  return {
    ...room,
    speaker: clampPosition(room.dims, room.speaker),
    listener: { ...clampPosition(room.dims, room.listener), yaw: room.listener.yaw },
  };
}

/**
 * Back and Next never drop an edit: the room is one value the steps share. Next stays put while the step has errors;
 * leaving the Size step pulls the speaker and listener inside the new size. Back always works, errors or not.
 */
export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  const index = WIZARD_STEPS.indexOf(state.step);
  switch (action.type) {
    case 'update':
      return { ...state, room: action.change(state.room) };
    case 'selectSurface':
      return { ...state, surface: action.surface };
    case 'back':
      return index > 0 ? { ...state, step: WIZARD_STEPS[index - 1] } : state;
    case 'next': {
      if (index === WIZARD_STEPS.length - 1 || stepErrors(state.step, state.room).length > 0) return state;
      const room = state.step === 'size' ? fitPositions(state.room) : state.room;
      return { ...state, step: WIZARD_STEPS[index + 1], room };
    }
  }
}
