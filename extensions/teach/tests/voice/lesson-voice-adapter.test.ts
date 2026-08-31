import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { NarrationBeat } from "../../shared/beat.ts";
import { LessonVoiceAdapter } from "../../src/voice/lesson-voice-adapter.ts";
import { createTeachVoice } from "../../src/voice/index.ts";
import { FakeProxyFetch } from "./support/fake-proxy-fetch.ts";

const LESSON_ID = "lesson-abc123";

function narrationBeat(overrides: Partial<NarrationBeat> = {}): NarrationBeat {
  return {
    kind: "narration",
    beatId: "beat-2",
    lessonId: LESSON_ID,
    sequenceNumber: 2,
    createdAt: "2024-05-01T10:00:00.000Z",
    relatedBeatId: "beat-1",
    chunks: [{ kind: "sentence", text: "A queue holds work until a worker is free." }],
    ...overrides,
  };
}

function adapterWithVoice(fetchFromProxy: FakeProxyFetch, beat: NarrationBeat | null) {
  const voice = createTeachVoice({ PI_PROXY_API_KEY: "test-key" }, fetchFromProxy.fetch);
  assert.notEqual(voice, null, "the voice module should have been built from a key");
  return new LessonVoiceAdapter({
    voice,
    findNarrationBeat: async (beatId) =>
      beat !== null && beat.beatId === beatId ? { lessonId: LESSON_ID, beat } : null,
  });
}

function adapterWithoutVoice() {
  return new LessonVoiceAdapter({
    // No credential in the environment, which is the lesson with no voice.
    voice: createTeachVoice({}, () => {
      throw new Error("a lesson without voice must never call the proxy");
    }),
    findNarrationBeat: async () => null,
  });
}

describe("LessonVoiceAdapter without a credential", () => {
  it("says voice is not available, rather than failing", () => {
    assert.equal(adapterWithoutVoice().isAvailable, false);
  });

  it("explains what is missing when the page asks to transcribe", async () => {
    const outcome = await adapterWithoutVoice().transcribe({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: "audio/webm",
    });

    assert.equal(outcome.kind, "unavailable");
    assert.match(outcome.kind === "unavailable" ? outcome.reason : "", /PI_PROXY_API_KEY|devx pi/);
  });

  it("explains what is missing when the page asks for narration audio", async () => {
    const outcome = await adapterWithoutVoice().narrationFor("beat-2");

    assert.equal(outcome.kind, "unavailable");
  });
});

describe("LessonVoiceAdapter writing down a recording", () => {
  it("hands back what was heard", async () => {
    const proxy = new FakeProxyFetch();
    proxy.answerWithJson({ text: "Because the worker was busy." });
    const adapter = adapterWithVoice(proxy, null);

    const outcome = await adapter.transcribe({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: "audio/webm;codecs=opus",
    });

    assert.deepEqual(outcome, { kind: "transcribed", text: "Because the worker was busy." });
  });

  it("refuses a format no browser records, without calling the proxy", async () => {
    const proxy = new FakeProxyFetch();
    const adapter = adapterWithVoice(proxy, null);

    const outcome = await adapter.transcribe({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: "audio/aiff",
    });

    assert.equal(outcome.kind, "refused");
    assert.equal(proxy.callCount, 0);
  });

  it("refuses an empty recording, without calling the proxy", async () => {
    const proxy = new FakeProxyFetch();
    const adapter = adapterWithVoice(proxy, null);

    const outcome = await adapter.transcribe({
      audio: new Uint8Array(),
      mimeType: "audio/webm",
    });

    assert.equal(outcome.kind, "refused");
    assert.equal(proxy.callCount, 0);
  });

  it("reports a proxy failure as a failure, not as an empty transcript", async () => {
    const proxy = new FakeProxyFetch();
    proxy.answerWithText("the proxy fell over", 500);
    const adapter = adapterWithVoice(proxy, null);

    const outcome = await adapter.transcribe({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: "audio/webm",
    });

    assert.equal(outcome.kind, "failed");
  });
});

describe("LessonVoiceAdapter reading a beat out loud", () => {
  it("hands back the spoken lines of the beat", async () => {
    const proxy = new FakeProxyFetch();
    proxy.answerWithAudio(new Uint8Array([0x49, 0x44, 0x33, 0x04]));
    const adapter = adapterWithVoice(proxy, narrationBeat());

    const outcome = await adapter.narrationFor("beat-2");

    assert.equal(outcome.kind, "ready");
    if (outcome.kind !== "ready") return;
    assert.equal(outcome.audio.beatId, "beat-2");
    assert.equal(outcome.audio.mimeType, "audio/mpeg");
    assert.equal(outcome.audio.lines.length, 1);
    assert.equal(outcome.audio.lines[0]?.text, "A queue holds work until a worker is free.");
    assert.equal(outcome.audio.lines[0]?.audioBase64, "SUQzBA==");
  });

  it("says the beat is unknown rather than speaking something else", async () => {
    const proxy = new FakeProxyFetch();
    const adapter = adapterWithVoice(proxy, narrationBeat());

    assert.equal((await adapter.narrationFor("beat-99")).kind, "unknown_beat");
    assert.equal(proxy.callCount, 0);
  });

  it("says the beat could not be spoken rather than sending silence", async () => {
    const proxy = new FakeProxyFetch();
    proxy.answerWithText("no capacity", 503);
    const adapter = adapterWithVoice(proxy, narrationBeat());

    const outcome = await adapter.narrationFor("beat-2");

    assert.equal(outcome.kind, "failed");
    assert.match(outcome.kind === "failed" ? outcome.reason : "", /beat-2|could not/i);
  });

  it("speaks the same beat once, however many times the page asks", async () => {
    const proxy = new FakeProxyFetch();
    proxy.answerWithAudio(new Uint8Array([0x49, 0x44, 0x33]));
    const adapter = adapterWithVoice(proxy, narrationBeat());

    await adapter.narrationFor("beat-2");
    proxy.answerWithAudio(new Uint8Array([0x49, 0x44, 0x33]));
    await adapter.narrationFor("beat-2");

    assert.equal(proxy.callCount, 1);
  });

  it("really retries after a lesson's audio is forgotten", async () => {
    const proxy = new FakeProxyFetch();
    proxy.answerWithAudio(new Uint8Array([0x49, 0x44, 0x33]));
    const adapter = adapterWithVoice(proxy, narrationBeat());

    await adapter.narrationFor("beat-2");
    adapter.forgetLesson(LESSON_ID);
    proxy.answerWithAudio(new Uint8Array([0x49, 0x44, 0x33]));
    await adapter.narrationFor("beat-2");

    assert.equal(proxy.callCount, 2);
  });
});
