/**
 * The voice session, as one object the page can hold.
 *
 * It joins the four pieces that have to agree with each other: the state machine
 * that decides what a key press means, the recorder, the audio player, and the
 * lesson server. Nothing here is React — the page subscribes and re-renders. That
 * keeps the contract testable and leaves the React wiring a small, separate step.
 *
 * The order in Space-to-talk matters and is fixed here: audio stops *before* the
 * microphone opens, so the recording never contains the lesson's own voice.
 */

import type { Recording } from "./microphone-recorder.ts";
import { MicrophoneRecorder } from "./microphone-recorder.ts";
import { AudioPlaybackController } from "./audio-playback-controller.ts";
import type {
  VoiceKeyEvent,
  VoiceSessionEffect,
  VoiceSessionReport,
  VoiceSessionState,
} from "./voice-session-state.ts";
import { applyVoiceKey, applyVoiceReport, voiceStatusLabel } from "./voice-session-state.ts";

const EDITABLE_TAG_NAMES = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON"]);

/** Everything the controller needs from the lesson server. */
export interface VoiceTransport {
  /** Sends the recording to the lesson server, which calls the proxy. */
  transcribe(recording: Recording): Promise<string>;
  /** Hands the learner's words to the teaching agent. Resolves when the turn ends. */
  submitAnswer(text: string): Promise<void>;
}

export interface VoiceSessionView {
  readonly state: VoiceSessionState;
  readonly statusLabel: string;
  readonly isAudioPaused: boolean;
  /** The last thing that went wrong, or null. Never hidden behind stand-in audio. */
  readonly error: string | null;
}

export interface VoiceControllerParts {
  readonly transport: VoiceTransport;
  readonly recorder?: MicrophoneRecorder;
  readonly playback?: AudioPlaybackController;
}

export class VoiceController {
  private readonly transport: VoiceTransport;
  private readonly recorder: MicrophoneRecorder;
  private readonly playback: AudioPlaybackController;
  private readonly listeners = new Set<(view: VoiceSessionView) => void>();

  private state: VoiceSessionState = "idle";
  private error: string | null = null;
  private isAudioPaused = false;
  /** Bumped whenever speech is stopped, so a stale line never resumes over a new one. */
  private speechGeneration = 0;
  /**
   * The last view the listeners were given. Every change goes out from one place and
   * is compared against this, so no change is published twice and — the failure that
   * matters — no change is left unpublished. The page draws Pause and Resume from the
   * published view alone, so a paused flag the page never hears about is a button
   * that says the wrong thing and does nothing when it is pressed.
   */
  private publishedView: VoiceSessionView | null = null;

  constructor(parts: VoiceControllerParts) {
    this.transport = parts.transport;
    this.recorder = parts.recorder ?? new MicrophoneRecorder();
    this.playback = parts.playback ?? new AudioPlaybackController();
  }

  get view(): VoiceSessionView {
    return {
      state: this.state,
      statusLabel: voiceStatusLabel(this.state),
      isAudioPaused: this.isAudioPaused,
      error: this.error,
    };
  }

  subscribe(listener: (view: VoiceSessionView) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Speaks the narration of one beat, line by line. Returns as soon as the lesson
   * is interrupted, so the caller does not have to know how far it got.
   */
  async speak(lines: readonly Blob[]): Promise<void> {
    this.stopSpeaking();
    const generation = this.speechGeneration;
    this.report("speech_started");

    for (const line of lines) {
      if (generation !== this.speechGeneration) {
        return;
      }
      const outcome = await this.playback.play(line);
      if (outcome.reason === "stopped" || outcome.reason === "replaced") {
        return;
      }
      if (outcome.reason === "failed") {
        this.fail(outcome.error?.message ?? "The lesson's audio could not be played.");
        return;
      }
    }

    if (generation === this.speechGeneration) {
      this.report("speech_finished");
    }
  }

  stopSpeaking(): void {
    this.speechGeneration += 1;
    this.isAudioPaused = false;
    this.playback.stopNow();
    this.publish();
  }

  /**
   * Pausing is about the speaking session, not about whether a line happens to be
   * playing this instant. Between two lines of one beat there is nothing playing,
   * and a Pause pressed there used to do nothing at all.
   */
  pauseSpeaking(): void {
    if (this.state !== "speaking" || this.isAudioPaused) {
      return;
    }
    this.playback.pause();
    this.isAudioPaused = true;
    this.publish();
  }

  resumeSpeaking(): void {
    if (!this.isAudioPaused) {
      return;
    }
    this.playback.resume();
    this.isAudioPaused = false;
    this.publish();
  }

  /** Wire this to the window's keydown. Returns true when the key was claimed. */
  handleKeyDown(event: KeyboardEvent): boolean {
    const outcome = applyVoiceKey(this.state, voiceKeyEventFrom(event));
    if (outcome.handled) {
      event.preventDefault();
    }
    this.moveTo(outcome.state);
    for (const effect of outcome.effects) {
      this.run(effect);
    }
    return outcome.handled;
  }

  dispose(): void {
    this.speechGeneration += 1;
    this.recorder.cancel();
    this.playback.dispose();
    this.listeners.clear();
  }

  private run(effect: VoiceSessionEffect): void {
    switch (effect) {
      case "stop_speech":
        this.stopSpeaking();
        return;
      case "start_listening":
        void this.startListening();
        return;
      case "submit_recording":
        void this.submitRecording();
        return;
      case "cancel_recording":
        this.recorder.cancel();
        this.clearError();
        return;
      case "cancel_transcription":
        // The request is already with the lesson server; its answer is dropped by
        // the state check in submitRecording rather than cancelled mid-flight.
        this.clearError();
        return;
    }
  }

  private async startListening(): Promise<void> {
    this.clearError();
    try {
      await this.recorder.start();
    } catch (cause) {
      this.fail(messageFor(cause));
    }
  }

  private async submitRecording(): Promise<void> {
    let recording: Recording;
    try {
      recording = await this.recorder.stop();
    } catch (cause) {
      this.fail(messageFor(cause));
      return;
    }

    let transcript: string;
    try {
      transcript = await this.transport.transcribe(recording);
    } catch (cause) {
      this.fail(messageFor(cause));
      return;
    }

    // Escape during the transcription already moved the session on; the late
    // transcript belongs to a turn the learner gave up on.
    if (this.state !== "transcribing") {
      return;
    }
    if (transcript.trim() === "") {
      this.fail("Nothing was heard in that recording.");
      return;
    }

    this.report("transcript_ready");
    try {
      await this.transport.submitAnswer(transcript);
      this.report("turn_finished");
    } catch (cause) {
      this.fail(messageFor(cause));
    }
  }

  private report(report: VoiceSessionReport): void {
    this.moveTo(applyVoiceReport(this.state, report));
  }

  private moveTo(state: VoiceSessionState): void {
    this.state = state;
    this.publish();
  }

  private fail(message: string): void {
    this.error = message;
    this.recorder.cancel();
    this.state = applyVoiceReport(this.state, "failed");
    this.publish();
  }

  private clearError(): void {
    this.error = null;
    this.publish();
  }

  private publish(): void {
    const view = this.view;
    if (this.publishedView !== null && isSameView(this.publishedView, view)) {
      return;
    }
    this.publishedView = view;
    for (const listener of this.listeners) {
      listener(view);
    }
  }
}

function isSameView(left: VoiceSessionView, right: VoiceSessionView): boolean {
  return (
    left.state === right.state &&
    left.statusLabel === right.statusLabel &&
    left.isAudioPaused === right.isAudioPaused &&
    left.error === right.error
  );
}

export function voiceKeyEventFrom(event: KeyboardEvent): VoiceKeyEvent {
  return {
    key: event.key,
    targetIsEditable: isEditableTarget(event.target),
    isRepeat: event.repeat,
    hasModifier: event.ctrlKey || event.metaKey || event.altKey || event.shiftKey,
  };
}

/**
 * Read structurally rather than with `instanceof HTMLElement`, for two reasons: the
 * element may come from another document, and `HTMLElement` does not exist outside a
 * browser, so an `instanceof` here would throw in a test rather than answer.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (target === null || typeof target !== "object") {
    return false;
  }
  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  if (element.isContentEditable === true) {
    return true;
  }
  return typeof element.tagName === "string" && EDITABLE_TAG_NAMES.has(element.tagName);
}

function messageFor(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
