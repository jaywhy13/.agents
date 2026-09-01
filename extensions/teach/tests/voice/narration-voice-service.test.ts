import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { NarrationChunk } from "../../shared/beat.ts";
import { NarrationAudioCache } from "../../src/voice/narration-audio-cache.ts";
import { NarrationVoiceService } from "../../src/voice/narration-voice-service.ts";
import { FakeSpeechClient, spokenTextOf } from "./support/fake-speech-client.ts";

function chunks(...sentences: readonly string[]): readonly NarrationChunk[] {
  return sentences.map((text) => ({ kind: "sentence", text }));
}

function serviceWith(speechClient: FakeSpeechClient, cache = new NarrationAudioCache()) {
  return { service: new NarrationVoiceService(speechClient, cache), cache };
}

function narrationOf(chunkList: readonly NarrationChunk[], beatId = "beat-1") {
  return { lessonId: "lesson-1", beatId, chunks: chunkList };
}

describe("narrating a beat", () => {
  it("speaks the words of the beat", async () => {
    const speechClient = new FakeSpeechClient();
    const { service } = serviceWith(speechClient);

    const narrated = await service.narrateBeat(narrationOf(chunks("A queue holds work.")));

    assert.equal(spokenTextOf(narrated.lines[0]?.audio ?? new Uint8Array()), "A queue holds work.");
  });

  it("keeps the lines in the order they are spoken", async () => {
    const speechClient = new FakeSpeechClient(30);
    const { service } = serviceWith(speechClient);

    const narrated = await service.narrateBeat(
      narrationOf(chunks("A queue holds work.", "A worker takes one job.")),
    );

    assert.deepEqual(
      narrated.lines.map((line) => line.text),
      ["A queue holds work.", "A worker takes one job."],
    );
  });

  it("numbers the lines so the page can play them in order", async () => {
    const speechClient = new FakeSpeechClient(30);
    const { service } = serviceWith(speechClient);

    const narrated = await service.narrateBeat(
      narrationOf(chunks("A queue holds work.", "A worker takes one job.")),
    );

    assert.deepEqual(
      narrated.lines.map((line) => line.lineIndex),
      [0, 1],
    );
  });

  it("names the beat the audio belongs to", async () => {
    const speechClient = new FakeSpeechClient();
    const { service } = serviceWith(speechClient);

    const narrated = await service.narrateBeat(narrationOf(chunks("A queue."), "beat-7"));

    assert.equal(narrated.beatId, "beat-7");
  });

  it("returns no lines for a beat with nothing to say", async () => {
    const speechClient = new FakeSpeechClient();
    const { service } = serviceWith(speechClient);

    const narrated = await service.narrateBeat(narrationOf(chunks("   ")));

    assert.deepEqual(narrated.lines, []);
    assert.equal(speechClient.callCount, 0);
  });
});

describe("paying for the same words twice", () => {
  it("does not call the proxy again for a beat it has already spoken", async () => {
    const speechClient = new FakeSpeechClient();
    const { service } = serviceWith(speechClient);

    await service.narrateBeat(narrationOf(chunks("A queue holds work.")));
    await service.narrateBeat(narrationOf(chunks("A queue holds work.")));

    assert.equal(speechClient.callCount, 1);
  });

  it("says which lines came from the cache", async () => {
    const speechClient = new FakeSpeechClient();
    const { service } = serviceWith(speechClient);

    await service.narrateBeat(narrationOf(chunks("A queue holds work.")));
    const replayed = await service.narrateBeat(narrationOf(chunks("A queue holds work.")));

    assert.equal(replayed.lines[0]?.servedFromCache, true);
  });

  it("gives back the same audio on the replay", async () => {
    const speechClient = new FakeSpeechClient();
    const { service } = serviceWith(speechClient);

    const first = await service.narrateBeat(narrationOf(chunks("A queue holds work.")));
    const replayed = await service.narrateBeat(narrationOf(chunks("A queue holds work.")));

    assert.deepEqual(replayed.lines[0]?.audio, first.lines[0]?.audio);
  });

  it("speaks again when the words of the beat change", async () => {
    const speechClient = new FakeSpeechClient();
    const { service } = serviceWith(speechClient);

    await service.narrateBeat(narrationOf(chunks("A queue holds work.")));
    await service.narrateBeat(narrationOf(chunks("A queue holds jobs.")));

    assert.equal(speechClient.callCount, 2);
  });

  it("speaks again for the same words in a different beat", async () => {
    const speechClient = new FakeSpeechClient();
    const { service } = serviceWith(speechClient);

    await service.narrateBeat(narrationOf(chunks("A queue holds work."), "beat-1"));
    await service.narrateBeat(narrationOf(chunks("A queue holds work."), "beat-2"));

    assert.equal(speechClient.callCount, 2);
  });

  it("speaks again after the voice is changed", async () => {
    const speechClient = new FakeSpeechClient();
    const { service } = serviceWith(speechClient);
    await service.narrateBeat(narrationOf(chunks("A queue holds work.")));

    speechClient.defaultSpeechVoice = "sage";
    await service.narrateBeat(narrationOf(chunks("A queue holds work.")));

    assert.equal(speechClient.callCount, 2);
  });
});

describe("when the beat cannot be spoken", () => {
  it("reports the failure instead of returning stand-in audio", async () => {
    const speechClient = new FakeSpeechClient();
    speechClient.failNextCall(new Error("proxy is down"));
    const { service } = serviceWith(speechClient);

    await assert.rejects(service.narrateBeat(narrationOf(chunks("A queue holds work."))), {
      name: "NarrationAudioUnavailableError",
    });
  });

  it("names the beat that could not be spoken", async () => {
    const speechClient = new FakeSpeechClient();
    speechClient.failNextCall(new Error("proxy is down"));
    const { service } = serviceWith(speechClient);

    await assert.rejects(service.narrateBeat(narrationOf(chunks("A queue."), "beat-9")), {
      message: /beat-9/,
    });
  });

  it("keeps the reason the proxy gave", async () => {
    const speechClient = new FakeSpeechClient();
    const proxyFailure = new Error("proxy is down");
    speechClient.failNextCall(proxyFailure);
    const { service } = serviceWith(speechClient);

    await assert.rejects(service.narrateBeat(narrationOf(chunks("A queue."))), (thrown: unknown) => {
      assert.ok(thrown instanceof Error);
      assert.equal(thrown.cause, proxyFailure);
      return true;
    });
  });

  it("caches nothing for a beat that failed", async () => {
    const speechClient = new FakeSpeechClient();
    speechClient.failNextCall(new Error("proxy is down"));
    const { service, cache } = serviceWith(speechClient);

    await assert.rejects(service.narrateBeat(narrationOf(chunks("A queue."))));

    assert.equal(cache.entryCount, 0);
  });

  it("speaks the beat on a later attempt once the proxy is back", async () => {
    const speechClient = new FakeSpeechClient();
    speechClient.failNextCall(new Error("proxy is down"));
    const { service } = serviceWith(speechClient);
    await assert.rejects(service.narrateBeat(narrationOf(chunks("A queue holds work."))));

    const narrated = await service.narrateBeat(narrationOf(chunks("A queue holds work.")));

    assert.equal(spokenTextOf(narrated.lines[0]?.audio ?? new Uint8Array()), "A queue holds work.");
  });
});

describe("closing a lesson", () => {
  it("stops holding the lesson's audio", async () => {
    const speechClient = new FakeSpeechClient();
    const { service, cache } = serviceWith(speechClient);
    await service.narrateBeat(narrationOf(chunks("A queue holds work.")));

    service.forgetLesson("lesson-1");

    assert.equal(cache.entryCount, 0);
  });
});
