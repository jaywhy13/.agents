import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BrowserBeat } from "../../../shared/browser-beat.ts";
import type { LessonStatus } from "../../../shared/lesson.ts";
import type { SocketState } from "../lesson-socket.ts";
import { isMicrophoneCaptureSupported } from "./microphone-recorder.ts";
import { LessonVoiceTransport } from "./lesson-voice-transport.ts";
import type { VoiceSessionView } from "./voice-controller.ts";
import { VoiceController } from "./voice-controller.ts";

/**
 * The one owner of the Space key, and the one thing that speaks a beat.
 *
 * There used to be a second owner: `useNarrationHotkey` also listened for Space and
 * ran the same contract with nothing behind it. Two owners meant the first Space
 * press was claimed twice and only one of them did anything, so that hook is gone
 * and this is the only keydown listener on the page.
 *
 * The controller is not React. It is built once, subscribed to, and told about the
 * lesson; every visible state comes back through one view object.
 */

export interface LessonVoice {
  readonly view: VoiceSessionView;
  /** False when this lesson has no voice, or this browser cannot record. */
  readonly isAvailable: boolean;
  /** Why voice is off, when it is off. Shown once, plainly. */
  readonly unavailableReason: string | null;
  pause(): void;
  resume(): void;
  stopSpeaking(): void;
}

export interface LessonVoiceOptions {
  /**
   * Whether the lesson server has the Shopify AI Proxy credential, or null while it
   * has not answered yet. The page cannot know this on its own: the credential never
   * leaves the pi process.
   */
  readonly serverHasVoice: boolean | null;
  readonly beats: readonly BrowserBeat[];
  readonly lessonStatus: LessonStatus | null;
  /** Watched so a lesson that goes away cannot leave the session waiting for ever. */
  readonly socketState: SocketState;
  /** Sends the learner's words to the lesson as a question. */
  readonly onTranscript: (text: string) => void;
  /** Stops the teaching turn, the way the Stop control does. */
  readonly onInterruptTurn: () => void;
  readonly transport?: LessonVoiceTransport;
}

const NO_MICROPHONE_REASON =
  "This browser cannot record audio, so the lesson cannot listen. Chrome, Firefox, or Safari 14.1 and later can.";

const NO_CREDENTIAL_REASON =
  "This lesson has no voice: there is no Shopify AI Proxy credential in this pi session. Start pi through `devx pi` to turn voice on. The lesson still teaches, in writing.";

export function useLessonVoice(options: LessonVoiceOptions): LessonVoice {
  const [view, setView] = useState<VoiceSessionView>({
    state: "idle",
    statusLabel: "Press Space to talk",
    isAudioPaused: false,
    error: null,
  });
  const [unavailableReason, setUnavailableReason] = useState<string | null>(
    isMicrophoneCaptureSupported() ? null : NO_MICROPHONE_REASON,
  );

  const serverHasVoice = options.serverHasVoice;
  useEffect(() => {
    if (serverHasVoice === false) {
      setUnavailableReason((current) => current ?? NO_CREDENTIAL_REASON);
    }
  }, [serverHasVoice]);

  // Kept in refs so the controller is built once and never sees a stale callback.
  const onTranscript = useRef(options.onTranscript);
  onTranscript.current = options.onTranscript;
  const onInterruptTurn = useRef(options.onInterruptTurn);
  onInterruptTurn.current = options.onInterruptTurn;
  const turnFinished = useRef<(() => void) | null>(null);

  const transport = useMemo(
    () => options.transport ?? new LessonVoiceTransport(),
    [options.transport],
  );

  const controller = useMemo(
    () =>
      new VoiceController({
        transport: {
          transcribe: (recording) => transport.transcribe(recording),
          submitAnswer: (text) =>
            new Promise<void>((resolve) => {
              // Resolves when the lesson stops teaching, so the learner sees
              // "Thinking" for as long as the lesson really is thinking.
              turnFinished.current = resolve;
              onTranscript.current(text);
            }),
        },
      }),
    [transport],
  );

  useEffect(() => {
    setView(controller.view);
    const unsubscribe = controller.subscribe(setView);
    return () => {
      unsubscribe();
      controller.dispose();
    };
  }, [controller]);

  // The only keydown listener on the page. Space outside an editable control is
  // claimed here and nowhere else.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      controller.handleKeyDown(event);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [controller]);

  // Starting to listen has to stop the teaching turn too, or the lesson would keep
  // teaching over the learner. The controller stops the audio; this stops the turn.
  const isListening = view.state === "listening";
  useEffect(() => {
    if (isListening) {
      onInterruptTurn.current();
    }
  }, [isListening]);

  // "Thinking" ends when the lesson stops teaching. It also has to end when the
  // lesson server goes away, or Space would stay claimed-but-inert for ever on a page
  // whose socket has closed.
  const lessonStatus = options.lessonStatus;
  const socketState = options.socketState;
  useEffect(() => {
    const lessonIsBusy = lessonStatus === "teaching" && socketState !== "closed";
    if (lessonIsBusy) {
      return;
    }
    const resolve = turnFinished.current;
    turnFinished.current = null;
    resolve?.();
  }, [lessonStatus, socketState]);

  useNarrationSpeech({
    beats: options.beats,
    controller,
    transport,
    isVoiceOff: unavailableReason !== null,
    onVoiceUnavailable: setUnavailableReason,
  });

  return {
    view,
    isAvailable: unavailableReason === null,
    unavailableReason,
    pause: useCallback(() => controller.pauseSpeaking(), [controller]),
    resume: useCallback(() => controller.resumeSpeaking(), [controller]),
    stopSpeaking: useCallback(() => controller.stopSpeaking(), [controller]),
  };
}

interface NarrationSpeechOptions {
  readonly beats: readonly BrowserBeat[];
  readonly controller: VoiceController;
  readonly transport: LessonVoiceTransport;
  readonly isVoiceOff: boolean;
  readonly onVoiceUnavailable: (reason: string) => void;
}

/**
 * Speaks each narration beat as it arrives, in the order it arrived.
 *
 * The beats are spoken one after another on purpose. Speech is request and response,
 * so a beat's lines have to be made before any of it is heard; running two beats
 * side by side would make the learner hear them interleaved.
 *
 * A beat already spoken is never spoken again, so a re-render, a reconnect, or a
 * page that replays the lesson does not read the whole lesson out from the top.
 */
function useNarrationSpeech(options: NarrationSpeechOptions): void {
  const { beats, controller, transport, isVoiceOff, onVoiceUnavailable } = options;
  const spokenBeatIds = useRef(new Set<string>());
  const speaking = useRef<Promise<void>>(Promise.resolve());
  // Set once the server has said this lesson has no voice, so the page asks once.
  const voiceIsOff = useRef(isVoiceOff);
  voiceIsOff.current = voiceIsOff.current || isVoiceOff;

  // Everything already on screen when the page loads has been read, or was never
  // going to be: replaying a whole lesson out loud on reload would be a surprise.
  const isFirstBatch = useRef(true);

  useEffect(() => {
    const narrationBeats = beats.filter((beat) => beat.kind === "narration");

    if (isFirstBatch.current) {
      isFirstBatch.current = false;
      for (const beat of narrationBeats) {
        spokenBeatIds.current.add(beat.beatId);
      }
      return;
    }

    for (const beat of narrationBeats) {
      if (spokenBeatIds.current.has(beat.beatId) || voiceIsOff.current) {
        continue;
      }
      spokenBeatIds.current.add(beat.beatId);
      const beatId = beat.beatId;
      speaking.current = speaking.current.then(async () => {
        if (voiceIsOff.current) {
          return;
        }
        const outcome = await transport.narrationFor(beatId);
        switch (outcome.kind) {
          case "ready":
            await controller.speak(outcome.lines.map((line) => line.audio));
            return;
          case "unavailable":
            voiceIsOff.current = true;
            onVoiceUnavailable(outcome.reason);
            return;
          case "failed":
            // The words are already on screen, which is the whole fallback. A beat
            // that could not be spoken must not stop the next one being spoken.
            return;
        }
      });
    }
  }, [beats, controller, transport, onVoiceUnavailable]);
}
