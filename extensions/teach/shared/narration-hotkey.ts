/**
 * The Space key contract for the lesson page.
 *
 * Outside editable controls: the first Space stops the narration and starts
 * listening to the learner; the second Space stops listening and sends what was
 * said; Escape throws the recording away.
 *
 * This module is pure so the contract can be tested without a browser. The view
 * layer supplies the key facts and carries out the effects. Capturing audio is a
 * later adapter; the state and keyboard behaviour are settled here.
 */

export const NARRATION_HOTKEY_STATES = ["idle", "narrating", "recording"] as const;

export type NarrationHotkeyState = (typeof NARRATION_HOTKEY_STATES)[number];

export const NARRATION_HOTKEY_EFFECTS = [
  "interrupt_narration",
  "start_recording",
  "submit_recording",
  "cancel_recording",
] as const;

export type NarrationHotkeyEffect = (typeof NARRATION_HOTKEY_EFFECTS)[number];

export interface NarrationHotkeyEvent {
  readonly key: string;
  /** True when the key went to a text box, text area, select, or anything contenteditable. */
  readonly targetIsEditable: boolean;
  readonly isRepeat: boolean;
  /** True when Control, Alt, Meta or Shift is held, so the browser owns the shortcut. */
  readonly hasModifier: boolean;
}

export interface NarrationHotkeyOutcome {
  readonly state: NarrationHotkeyState;
  readonly effects: readonly NarrationHotkeyEffect[];
  /** True when the page should call preventDefault, so Space does not scroll. */
  readonly handled: boolean;
}

const SPACE_KEYS = [" ", "Space", "Spacebar"] as const;

export function applyNarrationHotkey(
  state: NarrationHotkeyState,
  event: NarrationHotkeyEvent,
): NarrationHotkeyOutcome {
  if (event.targetIsEditable || event.hasModifier) {
    return unhandled(state);
  }

  if (isSpaceKey(event.key)) {
    return applySpace(state, event);
  }
  if (event.key === "Escape") {
    return applyEscape(state);
  }

  return unhandled(state);
}

function applySpace(
  state: NarrationHotkeyState,
  event: NarrationHotkeyEvent,
): NarrationHotkeyOutcome {
  if (event.isRepeat) {
    // Holding Space must not restart or resubmit, but the page still must not scroll.
    return { state, effects: [], handled: true };
  }

  switch (state) {
    case "narrating":
      return {
        state: "recording",
        effects: ["interrupt_narration", "start_recording"],
        handled: true,
      };
    case "idle":
      return { state: "recording", effects: ["start_recording"], handled: true };
    case "recording":
      return { state: "idle", effects: ["submit_recording"], handled: true };
  }
}

function applyEscape(state: NarrationHotkeyState): NarrationHotkeyOutcome {
  switch (state) {
    case "recording":
      return { state: "idle", effects: ["cancel_recording"], handled: true };
    case "idle":
    case "narrating":
      return unhandled(state);
  }
}

function unhandled(state: NarrationHotkeyState): NarrationHotkeyOutcome {
  return { state, effects: [], handled: false };
}

function isSpaceKey(key: string): boolean {
  return (SPACE_KEYS as readonly string[]).includes(key);
}
