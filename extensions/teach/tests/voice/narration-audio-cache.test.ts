import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  NarrationAudioCache,
  narrationAudioKey,
} from "../../src/voice/narration-audio-cache.ts";
import { audioBytes } from "./support/fake-proxy-fetch.ts";

function keyFor(overrides: Partial<Parameters<typeof narrationAudioKey>[0]> = {}): string {
  return narrationAudioKey({
    lessonId: "lesson-1",
    beatId: "beat-1",
    text: "A queue holds work.",
    model: "gpt-4o-mini-tts",
    voice: "alloy",
    ...overrides,
  });
}

function cacheWith(largestEntries: number, largestTotalBytes: number): NarrationAudioCache {
  return new NarrationAudioCache({ largestEntries, largestTotalBytes });
}

describe("the cache key", () => {
  it("is the same for the same words in the same beat", () => {
    assert.equal(keyFor(), keyFor());
  });

  it("changes when the words change", () => {
    assert.notEqual(keyFor(), keyFor({ text: "A queue holds jobs." }));
  });

  it("changes when the voice changes, so a re-voiced beat is not a stale hit", () => {
    assert.notEqual(keyFor(), keyFor({ voice: "sage" }));
  });

  it("changes when the model changes", () => {
    assert.notEqual(keyFor(), keyFor({ model: "tts-1" }));
  });

  it("separates the same words in two beats", () => {
    assert.notEqual(keyFor(), keyFor({ beatId: "beat-2" }));
  });

  it("separates the same beat in two lessons", () => {
    assert.notEqual(keyFor(), keyFor({ lessonId: "lesson-2" }));
  });
});

describe("holding audio", () => {
  it("gives back exactly what was stored", () => {
    const cache = cacheWith(4, 1024);
    const spokenLine = audioBytes(64);

    cache.set(keyFor(), spokenLine);

    assert.deepEqual(cache.get(keyFor()), spokenLine);
  });

  it("reports a miss for words that were never spoken", () => {
    const cache = cacheWith(4, 1024);

    assert.equal(cache.get(keyFor()), null);
  });

  it("never holds empty audio, so one failure is not permanent silence", () => {
    const cache = cacheWith(4, 1024);

    cache.set(keyFor(), audioBytes(0));

    assert.equal(cache.get(keyFor()), null);
  });

  it("counts the bytes it is holding", () => {
    const cache = cacheWith(4, 1024);

    cache.set(keyFor(), audioBytes(64));

    assert.equal(cache.totalBytes, 64);
  });

  it("does not double-count audio stored twice under one key", () => {
    const cache = cacheWith(4, 1024);

    cache.set(keyFor(), audioBytes(64));
    cache.set(keyFor(), audioBytes(32));

    assert.equal(cache.totalBytes, 32);
  });
});

describe("staying inside its bounds", () => {
  it("drops the least recently used entry when there are too many", () => {
    const cache = cacheWith(2, 4096);
    cache.set(keyFor({ beatId: "oldest" }), audioBytes(16));
    cache.set(keyFor({ beatId: "middle" }), audioBytes(16));

    cache.set(keyFor({ beatId: "newest" }), audioBytes(16));

    assert.equal(cache.get(keyFor({ beatId: "oldest" })), null);
    assert.equal(cache.entryCount, 2);
  });

  it("keeps an entry that was read recently", () => {
    const cache = cacheWith(2, 4096);
    cache.set(keyFor({ beatId: "first" }), audioBytes(16));
    cache.set(keyFor({ beatId: "second" }), audioBytes(16));

    cache.get(keyFor({ beatId: "first" }));
    cache.set(keyFor({ beatId: "third" }), audioBytes(16));

    assert.notEqual(cache.get(keyFor({ beatId: "first" })), null);
  });

  it("drops old entries when the total size is passed", () => {
    const cache = cacheWith(10, 100);
    cache.set(keyFor({ beatId: "first" }), audioBytes(60));

    cache.set(keyFor({ beatId: "second" }), audioBytes(60));

    assert.equal(cache.get(keyFor({ beatId: "first" })), null);
    assert.equal(cache.totalBytes, 60);
  });

  it("refuses one clip bigger than the whole cache instead of emptying itself", () => {
    const cache = cacheWith(10, 100);
    cache.set(keyFor({ beatId: "kept" }), audioBytes(50));

    cache.set(keyFor({ beatId: "enormous" }), audioBytes(200));

    assert.notEqual(cache.get(keyFor({ beatId: "kept" })), null);
    assert.equal(cache.get(keyFor({ beatId: "enormous" })), null);
  });
});

describe("forgetting a lesson", () => {
  it("drops every line of the lesson that closed", () => {
    const cache = cacheWith(10, 4096);
    cache.set(keyFor({ lessonId: "closing", beatId: "beat-1" }), audioBytes(16));
    cache.set(keyFor({ lessonId: "closing", beatId: "beat-2" }), audioBytes(16));

    cache.forgetLesson("closing");

    assert.equal(cache.entryCount, 0);
    assert.equal(cache.totalBytes, 0);
  });

  it("leaves another lesson alone", () => {
    const cache = cacheWith(10, 4096);
    cache.set(keyFor({ lessonId: "closing" }), audioBytes(16));
    cache.set(keyFor({ lessonId: "still-open" }), audioBytes(16));

    cache.forgetLesson("closing");

    assert.notEqual(cache.get(keyFor({ lessonId: "still-open" })), null);
  });

  it("leaves a lesson whose id merely starts the same alone", () => {
    const cache = cacheWith(10, 4096);
    cache.set(keyFor({ lessonId: "lesson-10" }), audioBytes(16));

    cache.forgetLesson("lesson-1");

    assert.notEqual(cache.get(keyFor({ lessonId: "lesson-10" })), null);
  });
});
