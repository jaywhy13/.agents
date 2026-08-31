import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LARGEST_RECORDING_BYTES,
  LONGEST_RECORDING_MILLISECONDS,
  RECORDING_CHUNK_MILLISECONDS,
  SHORTEST_USEFUL_RECORDING_BYTES,
} from "../../frontend/src/voice/browser-voice-limits.ts";
import {
  MicrophoneRecorder,
  MicrophoneUnavailableError,
  RecordingTooShortError,
} from "../../frontend/src/voice/microphone-recorder.ts";
import {
  chunkOfBytes,
  FakeRecordingEnvironment,
} from "./support/fake-recording-environment.ts";

/** Comfortably over the "that was a mis-press" bound, so a test is about one thing. */
const USEFUL_CHUNK_BYTES = SHORTEST_USEFUL_RECORDING_BYTES * 2;

async function startedRecorder(): Promise<{
  readonly recorder: MicrophoneRecorder;
  readonly environment: FakeRecordingEnvironment;
}> {
  const environment = new FakeRecordingEnvironment();
  const recorder = new MicrophoneRecorder(environment);
  await recorder.start();
  return { recorder, environment };
}

describe("MicrophoneRecorder starting", () => {
  it("records in the first container this browser supports", async () => {
    const environment = new FakeRecordingEnvironment();
    environment.supportedMimeTypes = ["audio/mp4"];

    await new MicrophoneRecorder(environment).start();

    assert.equal(environment.startedRecorder.mimeType, "audio/mp4");
  });

  it("asks the browser for data as it goes, so the size can be watched", async () => {
    const { environment } = await startedRecorder();

    assert.equal(environment.startedRecorder.timesliceMilliseconds, RECORDING_CHUNK_MILLISECONDS);
  });

  it("refuses to record when the browser supports none of the containers", async () => {
    const environment = new FakeRecordingEnvironment();
    environment.supportedMimeTypes = [];

    await assert.rejects(
      () => new MicrophoneRecorder(environment).start(),
      MicrophoneUnavailableError,
    );
    assert.equal(environment.microphoneRequestCount, 0);
  });

  it("reports a microphone the learner has not allowed", async () => {
    const environment = new FakeRecordingEnvironment();
    environment.refuseMicrophone = new Error("Permission denied");

    await assert.rejects(
      () => new MicrophoneRecorder(environment).start(),
      MicrophoneUnavailableError,
    );
  });

  it("releases the microphone when the recorder itself cannot be built", async () => {
    const environment = new FakeRecordingEnvironment();
    environment.refuseRecorder = new Error("Unusable container");

    await assert.rejects(
      () => new MicrophoneRecorder(environment).start(),
      MicrophoneUnavailableError,
    );
    assert.equal(environment.trackStopCalls, 1);
  });

  it("refuses a second recording rather than opening a second microphone", async () => {
    const { recorder, environment } = await startedRecorder();

    await assert.rejects(() => recorder.start(), MicrophoneUnavailableError);
    assert.equal(environment.microphoneRequestCount, 1);
  });
});

describe("MicrophoneRecorder stopping on purpose", () => {
  it("hands back what was captured and says the learner stopped it", async () => {
    const { recorder, environment } = await startedRecorder();
    environment.startedRecorder.handOverChunk(chunkOfBytes(USEFUL_CHUNK_BYTES));

    const recording = await recorder.stop();

    assert.equal(recording.stopReason, "learner_stopped");
    assert.equal(recording.byteLength, USEFUL_CHUNK_BYTES);
    assert.equal(recording.mimeType, environment.startedRecorder.mimeType);
  });

  it("keeps the last chunk the browser hands over as it stops", async () => {
    const { recorder, environment } = await startedRecorder();
    environment.startedRecorder.finalChunk = chunkOfBytes(USEFUL_CHUNK_BYTES);

    const recording = await recorder.stop();

    assert.equal(recording.byteLength, USEFUL_CHUNK_BYTES);
  });

  it("releases the microphone once the recording is handed back", async () => {
    const { recorder, environment } = await startedRecorder();
    environment.startedRecorder.handOverChunk(chunkOfBytes(USEFUL_CHUNK_BYTES));

    await recorder.stop();

    assert.equal(environment.stoppedTrackCount, 1);
    assert.equal(environment.timeLimitTimer.wasCancelled, true);
  });

  it("refuses a mis-press rather than sending a recording with nothing in it", async () => {
    const { recorder, environment } = await startedRecorder();
    environment.startedRecorder.handOverChunk(chunkOfBytes(SHORTEST_USEFUL_RECORDING_BYTES - 1));

    await assert.rejects(() => recorder.stop(), RecordingTooShortError);
    assert.equal(environment.stoppedTrackCount, 1);
  });

  it("says there is nothing to stop rather than waiting for a recording", async () => {
    const recorder = new MicrophoneRecorder(new FakeRecordingEnvironment());

    await assert.rejects(() => recorder.stop(), MicrophoneUnavailableError);
  });
});

describe("MicrophoneRecorder stopping itself at the time limit", () => {
  it("stops one answer's worth of recording, not a monologue", async () => {
    const { environment } = await startedRecorder();

    assert.equal(environment.timeLimitTimer.milliseconds, LONGEST_RECORDING_MILLISECONDS);
  });

  it("releases the microphone the moment the limit is reached", async () => {
    const { environment } = await startedRecorder();
    environment.startedRecorder.handOverChunk(chunkOfBytes(USEFUL_CHUNK_BYTES));

    environment.timeLimitTimer.fire();

    assert.equal(environment.startedRecorder.state, "inactive");
    assert.equal(environment.stoppedTrackCount, 1);
  });

  it("hands the recording back when the learner presses Space afterwards", async () => {
    const { recorder, environment } = await startedRecorder();
    environment.startedRecorder.handOverChunk(chunkOfBytes(USEFUL_CHUNK_BYTES));
    environment.timeLimitTimer.fire();

    const recording = await recorder.stop();

    assert.equal(recording.stopReason, "reached_time_limit");
    assert.equal(recording.byteLength, USEFUL_CHUNK_BYTES);
  });

  it("no longer calls itself recording once it has stopped itself", async () => {
    const { recorder, environment } = await startedRecorder();
    environment.timeLimitTimer.fire();

    assert.equal(recorder.isRecording, false);
  });
});

describe("MicrophoneRecorder stopping itself at the size limit", () => {
  it("stops as soon as the captured audio passes the limit", async () => {
    const { environment } = await startedRecorder();

    environment.startedRecorder.handOverChunk(chunkOfBytes(LARGEST_RECORDING_BYTES));
    assert.equal(environment.startedRecorder.state, "recording");
    environment.startedRecorder.handOverChunk(chunkOfBytes(1));

    assert.equal(environment.startedRecorder.state, "inactive");
    assert.equal(environment.stoppedTrackCount, 1);
  });

  it("hands back what fitted, and says why it stopped", async () => {
    const { recorder, environment } = await startedRecorder();
    environment.startedRecorder.handOverChunk(chunkOfBytes(LARGEST_RECORDING_BYTES));
    environment.startedRecorder.handOverChunk(chunkOfBytes(1));

    const recording = await recorder.stop();

    assert.equal(recording.stopReason, "reached_size_limit");
    assert.equal(recording.byteLength, LARGEST_RECORDING_BYTES);
  });
});

describe("MicrophoneRecorder when the browser's recorder fails", () => {
  it("reports the failure instead of waiting for a recording that will not arrive", async () => {
    const { recorder, environment } = await startedRecorder();
    environment.startedRecorder.reportError("The recorder stopped working.");

    await assert.rejects(() => recorder.stop(), MicrophoneUnavailableError);
  });

  it("releases the microphone when the browser's recorder fails", async () => {
    const { environment } = await startedRecorder();

    environment.startedRecorder.reportError("The recorder stopped working.");

    assert.equal(environment.stoppedTrackCount, 1);
    assert.equal(environment.timeLimitTimer.wasCancelled, true);
  });
});

describe("MicrophoneRecorder cleaning up", () => {
  it("throws the recording away and releases the microphone", async () => {
    const { recorder, environment } = await startedRecorder();
    environment.startedRecorder.handOverChunk(chunkOfBytes(USEFUL_CHUNK_BYTES));

    recorder.cancel();

    assert.equal(environment.startedRecorder.state, "inactive");
    assert.equal(environment.stoppedTrackCount, 1);
    assert.equal(recorder.isRecording, false);
  });

  it("stops the microphone track once however many times it is cancelled", async () => {
    const { recorder, environment } = await startedRecorder();

    recorder.cancel();
    recorder.cancel();
    recorder.cancel();

    assert.equal(environment.trackStopCalls, 1);
  });

  it("is safe to cancel when nothing is recording", () => {
    const recorder = new MicrophoneRecorder(new FakeRecordingEnvironment());

    assert.doesNotThrow(() => recorder.cancel());
  });

  it("stops the microphone track once when a recording that stopped itself is cancelled", async () => {
    const { recorder, environment } = await startedRecorder();
    environment.timeLimitTimer.fire();

    recorder.cancel();

    assert.equal(environment.trackStopCalls, 1);
  });

  it("lets the learner record again after a recording was thrown away", async () => {
    const { recorder, environment } = await startedRecorder();
    recorder.cancel();

    await recorder.start();

    assert.equal(environment.microphoneRequestCount, 2);
    assert.equal(recorder.isRecording, true);
  });
});
