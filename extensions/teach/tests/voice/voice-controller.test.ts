import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  PlaybackOutcome,
} from "../../frontend/src/voice/audio-playback-controller.ts";
import { AudioPlaybackController } from "../../frontend/src/voice/audio-playback-controller.ts";
import type { Recording } from "../../frontend/src/voice/microphone-recorder.ts";
import { MicrophoneRecorder } from "../../frontend/src/voice/microphone-recorder.ts";
import { VoiceController } from "../../frontend/src/voice/voice-controller.ts";
import type { VoiceSessionView } from "../../frontend/src/voice/voice-controller.ts";

/**
 * Records what the microphone was asked to do, without a browser. The real recorder
 * only touches browser APIs when it starts, so the class is stood in for wholesale.
 */
class FakeRecorder {
  startCount = 0;
  stopCount = 0;
  cancelCount = 0;
  failOnStart: Error | null = null;
  recording: Recording = {
    audio: { size: 3, type: "audio/webm" } as unknown as Blob,
    mimeType: "audio/webm",
    byteLength: 3,
    stopReason: "learner_stopped",
  };

  async start(): Promise<void> {
    this.startCount += 1;
    if (this.failOnStart !== null) {
      throw this.failOnStart;
    }
  }

  async stop(): Promise<Recording> {
    this.stopCount += 1;
    return this.recording;
  }

  cancel(): void {
    this.cancelCount += 1;
  }

  get asRecorder(): MicrophoneRecorder {
    return this as unknown as MicrophoneRecorder;
  }
}

/** Plays nothing, but says when it was stopped and in what order. */
class FakePlayback {
  readonly events: string[] = [];
  playedClips = 0;

  private finish: ((outcome: PlaybackOutcome) => void) | null = null;
  isPlaying = false;

  async play(): Promise<PlaybackOutcome> {
    this.playedClips += 1;
    this.isPlaying = true;
    this.events.push("play");
    return new Promise<PlaybackOutcome>((resolve) => {
      this.finish = resolve;
    });
  }

  finishClip(): void {
    this.settle({ reason: "finished" });
  }

  pause(): void {
    this.events.push("pause");
  }

  resume(): void {
    this.events.push("resume");
  }

  stopNow(): void {
    this.events.push("stop");
    this.settle({ reason: "stopped" });
  }

  dispose(): void {
    this.stopNow();
  }

  get asPlayback(): AudioPlaybackController {
    return this as unknown as AudioPlaybackController;
  }

  private settle(outcome: PlaybackOutcome): void {
    const finish = this.finish;
    this.finish = null;
    this.isPlaying = false;
    finish?.(outcome);
  }
}

interface Harness {
  readonly controller: VoiceController;
  readonly recorder: FakeRecorder;
  readonly playback: FakePlayback;
  readonly transcribedRecordings: Recording[];
  readonly submittedAnswers: string[];
  readonly views: VoiceSessionView[];
  finishTurn(): void;
}

function harness(options: { transcript?: string } = {}): Harness {
  const recorder = new FakeRecorder();
  const playback = new FakePlayback();
  const transcribedRecordings: Recording[] = [];
  const submittedAnswers: string[] = [];
  const views: VoiceSessionView[] = [];
  let finishTurn = (): void => {};

  const controller = new VoiceController({
    recorder: recorder.asRecorder,
    playback: playback.asPlayback,
    transport: {
      transcribe: async (recording) => {
        transcribedRecordings.push(recording);
        return options.transcript ?? "Because the worker was busy.";
      },
      submitAnswer: (text) =>
        new Promise<void>((resolve) => {
          submittedAnswers.push(text);
          finishTurn = resolve;
        }),
    },
  });
  controller.subscribe((view) => views.push(view));

  return {
    controller,
    recorder,
    playback,
    transcribedRecordings,
    submittedAnswers,
    views,
    finishTurn: () => finishTurn(),
  };
}

/** A key press as the page would report it, outside any editable control. */
function keyPress(key: string, overrides: Record<string, unknown> = {}): KeyboardEvent {
  let preventedDefault = false;
  return {
    key,
    target: null,
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: () => {
      preventedDefault = true;
    },
    get defaultPrevented(): boolean {
      return preventedDefault;
    },
    ...overrides,
  } as unknown as KeyboardEvent;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("VoiceController and the Space key", () => {
  it("stops the audio before it opens the microphone, so it never records itself", async () => {
    const { controller, playback, recorder } = harness();
    const speaking = controller.speak([{} as Blob]);

    controller.handleKeyDown(keyPress(" "));
    await settle();

    // Speaking clears whatever was playing first, hence the leading stop.
    assert.deepEqual(playback.events, ["stop", "play", "stop"]);
    assert.equal(recorder.startCount, 1);
    assert.equal(controller.view.state, "listening");
    await speaking;
  });

  it("starts listening from quiet too, not only while it is speaking", async () => {
    const { controller, recorder } = harness();

    controller.handleKeyDown(keyPress(" "));
    await settle();

    assert.equal(recorder.startCount, 1);
    assert.equal(controller.view.state, "listening");
  });

  it("claims Space so the page never scrolls out from under the learner", () => {
    const { controller } = harness();
    const event = keyPress(" ");

    const claimed = controller.handleKeyDown(event);

    assert.equal(claimed, true);
    assert.equal(event.defaultPrevented, true);
  });

  it("leaves Space alone inside a text box, so a question can be typed", () => {
    const { controller, recorder } = harness();
    const textArea = { tagName: "TEXTAREA", isContentEditable: false };

    const claimed = controller.handleKeyDown(keyPress(" ", { target: textArea }));

    assert.equal(claimed, false);
    assert.equal(recorder.startCount, 0);
  });

  it("sends what was said on the second Space, and shows the waits", async () => {
    const { controller, recorder, transcribedRecordings, submittedAnswers, finishTurn } =
      harness();

    controller.handleKeyDown(keyPress(" "));
    await settle();
    controller.handleKeyDown(keyPress(" "));

    assert.equal(controller.view.state, "transcribing");
    await settle();
    assert.equal(recorder.stopCount, 1);
    assert.equal(transcribedRecordings.length, 1);
    assert.deepEqual(submittedAnswers, ["Because the worker was busy."]);
    assert.equal(controller.view.state, "thinking");

    finishTurn();
    await settle();
    assert.equal(controller.view.state, "idle");
  });

  it("throws the recording away on Escape, and sends nothing", async () => {
    const { controller, recorder, transcribedRecordings } = harness();
    controller.handleKeyDown(keyPress(" "));
    await settle();

    controller.handleKeyDown(keyPress("Escape"));
    await settle();

    assert.equal(recorder.cancelCount, 1);
    assert.deepEqual(transcribedRecordings, []);
    assert.equal(controller.view.state, "idle");
  });

  it("holds Space without restarting or resending", async () => {
    const { controller, recorder } = harness();
    controller.handleKeyDown(keyPress(" "));
    await settle();

    controller.handleKeyDown(keyPress(" ", { repeat: true }));
    await settle();

    assert.equal(recorder.startCount, 1);
    assert.equal(recorder.stopCount, 0);
    assert.equal(controller.view.state, "listening");
  });

  it("claims Space but does nothing while the lesson is thinking", async () => {
    const { controller, recorder, finishTurn } = harness();
    controller.handleKeyDown(keyPress(" "));
    await settle();
    controller.handleKeyDown(keyPress(" "));
    await settle();

    const claimed = controller.handleKeyDown(keyPress(" "));

    assert.equal(claimed, true);
    assert.equal(recorder.startCount, 1);
    assert.equal(controller.view.state, "thinking");
    finishTurn();
  });

  it("leaves a shortcut with a modifier to the browser", () => {
    const { controller, recorder } = harness();

    assert.equal(controller.handleKeyDown(keyPress(" ", { metaKey: true })), false);
    assert.equal(recorder.startCount, 0);
  });

  it("says nothing was heard rather than sending an empty question", async () => {
    const { controller, submittedAnswers } = harness({ transcript: "   " });
    controller.handleKeyDown(keyPress(" "));
    await settle();

    controller.handleKeyDown(keyPress(" "));
    await settle();

    assert.deepEqual(submittedAnswers, []);
    assert.match(controller.view.error ?? "", /Nothing was heard/);
    assert.equal(controller.view.state, "idle");
  });

  it("reports a microphone the learner has not allowed, and stays quiet", async () => {
    const { controller, recorder } = harness();
    recorder.failOnStart = new Error("The microphone is not available.");

    controller.handleKeyDown(keyPress(" "));
    await settle();

    assert.match(controller.view.error ?? "", /microphone is not available/);
    assert.equal(controller.view.state, "idle");
  });
});

describe("VoiceController speaking a beat", () => {
  it("plays the lines of a beat one after another", async () => {
    const { controller, playback } = harness();

    const speaking = controller.speak([{} as Blob, {} as Blob]);
    await settle();
    assert.equal(playback.playedClips, 1);
    playback.finishClip();
    await settle();
    assert.equal(playback.playedClips, 2);
    playback.finishClip();
    await speaking;

    assert.equal(controller.view.state, "idle");
  });

  it("can be paused and resumed while it speaks", async () => {
    const { controller, playback } = harness();
    const speaking = controller.speak([{} as Blob]);
    await settle();

    controller.pauseSpeaking();
    assert.equal(controller.view.isAudioPaused, true);
    controller.resumeSpeaking();

    assert.deepEqual(playback.events, ["stop", "play", "pause", "resume"]);
    assert.equal(controller.view.isAudioPaused, false);
    controller.stopSpeaking();
    await speaking;
  });

  it("stops the rest of a beat once the learner interrupts it", async () => {
    const { controller, playback } = harness();

    const speaking = controller.speak([{} as Blob, {} as Blob, {} as Blob]);
    await settle();
    controller.stopSpeaking();
    await speaking;

    assert.equal(playback.playedClips, 1);
  });
});

/**
 * The Pause and Resume control is drawn from the published view alone. A change the
 * controller makes but does not publish leaves a button on screen that says the
 * wrong thing and does nothing when it is pressed.
 */
describe("VoiceController publishing whether the audio is paused", () => {
  it("tells the page the audio is no longer paused once speech is stopped", async () => {
    const { controller, views } = harness();
    const speaking = controller.speak([{} as Blob]);
    await settle();
    controller.pauseSpeaking();

    controller.stopSpeaking();
    await speaking;

    assert.equal(controller.view.isAudioPaused, false);
    assert.equal(views[views.length - 1]?.isAudioPaused, false);
  });

  it("tells the page the audio is no longer paused once the next beat speaks", async () => {
    const { controller, views } = harness();
    const firstBeat = controller.speak([{} as Blob]);
    await settle();
    controller.pauseSpeaking();

    const secondBeat = controller.speak([{} as Blob]);
    await settle();

    assert.equal(views[views.length - 1]?.isAudioPaused, false);
    controller.stopSpeaking();
    await Promise.all([firstBeat, secondBeat]);
  });

  it("tells the page the audio is no longer paused once the learner speaks instead", async () => {
    const { controller, views } = harness();
    const speaking = controller.speak([{} as Blob]);
    await settle();
    controller.pauseSpeaking();

    controller.handleKeyDown(keyPress(" "));
    await settle();

    assert.equal(views[views.length - 1]?.isAudioPaused, false);
    await speaking;
  });

  it("pauses a beat that is speaking but has not reached its first line yet", async () => {
    const { controller, playback } = harness();
    const speaking = controller.speak([{} as Blob]);
    playback.isPlaying = false;

    controller.pauseSpeaking();

    assert.equal(controller.view.isAudioPaused, true);
    controller.resumeSpeaking();
    assert.equal(controller.view.isAudioPaused, false);
    controller.stopSpeaking();
    await speaking;
  });

  it("ignores Pause when there is nothing being spoken", () => {
    const { controller, playback, views } = harness();

    controller.pauseSpeaking();

    assert.equal(controller.view.isAudioPaused, false);
    assert.deepEqual(playback.events, []);
    assert.deepEqual(views, []);
  });

  it("tells the page nothing when nothing about the session changed", async () => {
    const { controller, views } = harness();
    const speaking = controller.speak([{} as Blob]);
    await settle();
    const viewCountAfterSpeaking = views.length;

    controller.pauseSpeaking();
    controller.pauseSpeaking();
    controller.pauseSpeaking();

    assert.equal(views.length, viewCountAfterSpeaking + 1);
    controller.stopSpeaking();
    await speaking;
  });
});
