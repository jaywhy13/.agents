/**
 * What the learner is doing with their voice right now, and what the keyboard does
 * about it.
 *
 * The Space and Escape contract already exists as a pure state machine in
 * `shared/narration-hotkey.ts`. That machine knows three states: quiet, speaking,
 * and listening. A voice session has two more that the learner has to be able to
 * see — the wait while the recording is turned into text, and the wait while the
 * lesson thinks about the answer. This module adds those two states around the
 * shared contract instead of restating it, so there is still exactly one place
 * that decides what a Space press means.
 *
 * Pure on purpose: no browser, no timers, no audio. The controller supplies the
 * facts and carries out the effects, and this decides.
 */

import type { NarrationHotkeyEffect, NarrationHotkeyState } from "../../../shared/narration-hotkey.ts";
import { applyNarrationHotkey } from "../../../shared/narration-hotkey.ts";

export const VOICE_SESSION_STATES = [
  "idle",
  "speaking",
  "listening",
  "transcribing",
  "thinking",
] as const;

export type VoiceSessionState = (typeof VOICE_SESSION_STATES)[number];

export const VOICE_SESSION_EFFECTS = [
  "stop_speech",
  "start_listening",
  "submit_recording",
  "cancel_recording",
  "cancel_transcription",
] as const;

export type VoiceSessionEffect = (typeof VOICE_SESSION_EFFECTS)[number];

export interface VoiceKeyEvent {
  readonly key: string;
  /** True when the key went to a text box, text area, select, or anything contenteditable. */
  readonly targetIsEditable: boolean;
  readonly isRepeat: boolean;
  /** True when Control, Alt, Meta or Shift is held, so the browser owns the shortcut. */
  readonly hasModifier: boolean;
}

export interface VoiceSessionOutcome {
  readonly state: VoiceSessionState;
  readonly effects: readonly VoiceSessionEffect[];
  /** True when the page should call preventDefault, so Space does not scroll. */
  readonly handled: boolean;
}

/**
 * What the rest of the lesson tells the session, as opposed to what the keyboard
 * does: audio started or ended on its own, a transcript came back, the teaching
 * turn finished, or a step failed.
 */
export const VOICE_SESSION_REPORTS = [
  "speech_started",
  "speech_finished",
  "transcript_ready",
  "turn_finished",
  "failed",
] as const;

export type VoiceSessionReport = (typeof VOICE_SESSION_REPORTS)[number];

const SPACE_KEYS = [" ", "Space", "Spacebar"] as const;

export function applyVoiceKey(state: VoiceSessionState, event: VoiceKeyEvent): VoiceSessionOutcome {
  if (event.targetIsEditable || event.hasModifier) {
    return unhandled(state);
  }

  if (isWaitingOnTheProxy(state)) {
    return applyKeyWhileWaiting(state, event);
  }

  return translateSharedOutcome(
    state,
    applyNarrationHotkey(sharedStateFor(state), {
      key: event.key,
      targetIsEditable: event.targetIsEditable,
      isRepeat: event.isRepeat,
      hasModifier: event.hasModifier,
    }),
  );
}

/**
 * During a transcription or a teaching turn there is nothing to start or stop with
 * Space, but the key is still claimed so the lesson page never scrolls out from
 * under the learner mid-answer. Escape gives up on a transcription; a teaching turn
 * is stopped by the lesson's own Stop control, not by this machine.
 */
function applyKeyWhileWaiting(
  state: VoiceSessionState,
  event: VoiceKeyEvent,
): VoiceSessionOutcome {
  if (isSpaceKey(event.key)) {
    return { state, effects: [], handled: true };
  }
  if (event.key === "Escape" && state === "transcribing") {
    return { state: "idle", effects: ["cancel_transcription"], handled: true };
  }
  return unhandled(state);
}

/**
 * The shared contract ends a submitted recording in its quiet state, because it
 * does not know the transcription step exists. The session does, so a submission
 * lands in `transcribing` instead.
 */
function translateSharedOutcome(
  state: VoiceSessionState,
  outcome: ReturnType<typeof applyNarrationHotkey>,
): VoiceSessionOutcome {
  const effects = outcome.effects.map(translateEffect);
  const submitted = effects.includes("submit_recording");

  return {
    state: submitted ? "transcribing" : voiceStateFor(outcome.state, state),
    effects,
    handled: outcome.handled,
  };
}

function translateEffect(effect: NarrationHotkeyEffect): VoiceSessionEffect {
  switch (effect) {
    case "interrupt_narration":
      return "stop_speech";
    case "start_recording":
      return "start_listening";
    case "submit_recording":
      return "submit_recording";
    case "cancel_recording":
      return "cancel_recording";
  }
}

export function applyVoiceReport(
  state: VoiceSessionState,
  report: VoiceSessionReport,
): VoiceSessionState {
  switch (report) {
    case "speech_started":
      // A recording in progress owns the session; late audio must not cut it off.
      return state === "listening" ? state : "speaking";
    case "speech_finished":
      return state === "speaking" ? "idle" : state;
    case "transcript_ready":
      return state === "transcribing" ? "thinking" : state;
    case "turn_finished":
      return state === "thinking" ? "idle" : state;
    case "failed":
      return "idle";
  }
}

/** The words shown in the status bar, one per state. */
export function voiceStatusLabel(state: VoiceSessionState): string {
  switch (state) {
    case "idle":
      return "Press Space to talk";
    case "speaking":
      return "Speaking";
    case "listening":
      return "Listening";
    case "transcribing":
      return "Writing down what you said";
    case "thinking":
      return "Thinking";
  }
}

/** True while the session is waiting on the lesson server and cannot be hurried. */
export function isWaitingOnTheProxy(state: VoiceSessionState): boolean {
  return state === "transcribing" || state === "thinking";
}

export function isMicrophoneOpen(state: VoiceSessionState): boolean {
  return state === "listening";
}

function sharedStateFor(state: VoiceSessionState): NarrationHotkeyState {
  switch (state) {
    case "speaking":
      return "narrating";
    case "listening":
      return "recording";
    case "idle":
    case "transcribing":
    case "thinking":
      return "idle";
  }
}

function voiceStateFor(
  sharedState: NarrationHotkeyState,
  currentState: VoiceSessionState,
): VoiceSessionState {
  switch (sharedState) {
    case "narrating":
      return "speaking";
    case "recording":
      return "listening";
    case "idle":
      // The shared machine has one quiet state; keep whichever quiet state we were in.
      return isWaitingOnTheProxy(currentState) ? currentState : "idle";
  }
}

function unhandled(state: VoiceSessionState): VoiceSessionOutcome {
  return { state, effects: [], handled: false };
}

function isSpaceKey(key: string): boolean {
  return (SPACE_KEYS as readonly string[]).includes(key);
}
