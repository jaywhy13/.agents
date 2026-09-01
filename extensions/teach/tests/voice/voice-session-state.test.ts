import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  VoiceKeyEvent,
  VoiceSessionState,
} from "../../frontend/src/voice/voice-session-state.ts";
import {
  applyVoiceKey,
  applyVoiceReport,
  isMicrophoneOpen,
  isWaitingOnTheProxy,
  voiceStatusLabel,
  VOICE_SESSION_STATES,
} from "../../frontend/src/voice/voice-session-state.ts";

function pressSpace(overrides: Partial<VoiceKeyEvent> = {}): VoiceKeyEvent {
  return { key: " ", targetIsEditable: false, isRepeat: false, hasModifier: false, ...overrides };
}

function pressEscape(overrides: Partial<VoiceKeyEvent> = {}): VoiceKeyEvent {
  return { ...pressSpace(overrides), key: "Escape" };
}

describe("the first Space", () => {
  it("stops the lesson speaking and opens the microphone", () => {
    const outcome = applyVoiceKey("speaking", pressSpace());

    assert.deepEqual(outcome.effects, ["stop_speech", "start_listening"]);
    assert.equal(outcome.state, "listening");
  });

  it("stops the speech before it opens the microphone", () => {
    const outcome = applyVoiceKey("speaking", pressSpace());

    assert.equal(outcome.effects[0], "stop_speech");
  });

  it("opens the microphone with no interruption when the lesson is quiet", () => {
    const outcome = applyVoiceKey("idle", pressSpace());

    assert.deepEqual(outcome.effects, ["start_listening"]);
    assert.equal(outcome.state, "listening");
  });

  it("claims the key so the lesson page does not scroll", () => {
    assert.equal(applyVoiceKey("idle", pressSpace()).handled, true);
  });
});

describe("the second Space", () => {
  it("closes the microphone and sends what was said", () => {
    const outcome = applyVoiceKey("listening", pressSpace());

    assert.deepEqual(outcome.effects, ["submit_recording"]);
  });

  it("moves to the transcribing state so the wait is visible", () => {
    assert.equal(applyVoiceKey("listening", pressSpace()).state, "transcribing");
  });
});

describe("holding Space down", () => {
  it("does not send the recording again", () => {
    const outcome = applyVoiceKey("listening", pressSpace({ isRepeat: true }));

    assert.deepEqual(outcome.effects, []);
    assert.equal(outcome.state, "listening");
  });

  it("still claims the key so the page does not scroll", () => {
    assert.equal(applyVoiceKey("listening", pressSpace({ isRepeat: true })).handled, true);
  });
});

describe("Escape", () => {
  it("throws away a recording in progress", () => {
    const outcome = applyVoiceKey("listening", pressEscape());

    assert.deepEqual(outcome.effects, ["cancel_recording"]);
    assert.equal(outcome.state, "idle");
  });

  it("gives up on a transcription that has not come back", () => {
    const outcome = applyVoiceKey("transcribing", pressEscape());

    assert.deepEqual(outcome.effects, ["cancel_transcription"]);
    assert.equal(outcome.state, "idle");
  });

  it("leaves a teaching turn to the lesson's own Stop control", () => {
    const outcome = applyVoiceKey("thinking", pressEscape());

    assert.deepEqual(outcome.effects, []);
    assert.equal(outcome.handled, false);
  });
});

describe("Space while the lesson server is working", () => {
  it("does nothing while the recording is being written down", () => {
    assert.deepEqual(applyVoiceKey("transcribing", pressSpace()).effects, []);
  });

  it("does nothing while the lesson is thinking", () => {
    assert.deepEqual(applyVoiceKey("thinking", pressSpace()).effects, []);
  });

  it("still claims the key, so the page never scrolls mid-answer", () => {
    assert.equal(applyVoiceKey("thinking", pressSpace()).handled, true);
  });
});

describe("keys the lesson page must not take", () => {
  it("ignores Space typed into a text box", () => {
    const outcome = applyVoiceKey("idle", pressSpace({ targetIsEditable: true }));

    assert.equal(outcome.handled, false);
    assert.deepEqual(outcome.effects, []);
  });

  it("ignores a browser shortcut such as Command-Space", () => {
    assert.equal(applyVoiceKey("idle", pressSpace({ hasModifier: true })).handled, false);
  });

  it("ignores every other key", () => {
    assert.equal(applyVoiceKey("idle", pressSpace({ key: "a" })).handled, false);
  });
});

describe("what the lesson reports back", () => {
  it("shows the speaking state when audio starts", () => {
    assert.equal(applyVoiceReport("idle", "speech_started"), "speaking");
  });

  it("does not cut off a recording when late audio arrives", () => {
    assert.equal(applyVoiceReport("listening", "speech_started"), "listening");
  });

  it("falls quiet when the audio ends on its own", () => {
    assert.equal(applyVoiceReport("speaking", "speech_finished"), "idle");
  });

  it("moves from writing down to thinking when the transcript arrives", () => {
    assert.equal(applyVoiceReport("transcribing", "transcript_ready"), "thinking");
  });

  it("falls quiet when the teaching turn ends", () => {
    assert.equal(applyVoiceReport("thinking", "turn_finished"), "idle");
  });

  it("falls quiet on any failure, so no state is left stuck", () => {
    for (const state of VOICE_SESSION_STATES) {
      assert.equal(applyVoiceReport(state, "failed"), "idle");
    }
  });

  it("ignores a transcript that arrives after the learner gave up", () => {
    assert.equal(applyVoiceReport("idle", "transcript_ready"), "idle");
  });
});

describe("what the learner is shown", () => {
  it("gives every state its own words", () => {
    const labels = new Set(VOICE_SESSION_STATES.map(voiceStatusLabel));

    assert.equal(labels.size, VOICE_SESSION_STATES.length);
  });

  it("marks only the two waiting states as waiting", () => {
    const waitingStates = VOICE_SESSION_STATES.filter((state: VoiceSessionState) =>
      isWaitingOnTheProxy(state),
    );

    assert.deepEqual(waitingStates, ["transcribing", "thinking"]);
  });

  it("marks the microphone open only while listening", () => {
    const listeningStates = VOICE_SESSION_STATES.filter((state: VoiceSessionState) =>
      isMicrophoneOpen(state),
    );

    assert.deepEqual(listeningStates, ["listening"]);
  });
});
