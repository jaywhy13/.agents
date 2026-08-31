import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { NarrationChunk } from "../../shared/beat.ts";
import {
  speechTextForNarration,
  splitIntoSpeechLines,
} from "../../src/voice/narration-speech-text.ts";

describe("the words that go to the speech route", () => {
  it("joins the chunks of a beat into one run of speech", () => {
    const beatChunks: readonly NarrationChunk[] = [
      { kind: "sentence", text: "A queue holds work." },
      { kind: "term", text: "Producer" },
    ];

    assert.equal(speechTextForNarration(beatChunks), "A queue holds work. Producer");
  });
});

describe("cutting narration into short lines", () => {
  it("keeps a short beat as one line, so it is spoken in one request", () => {
    assert.deepEqual(splitIntoSpeechLines("A queue holds work.", 100), ["A queue holds work."]);
  });

  it("returns nothing for blank narration", () => {
    assert.deepEqual(splitIntoSpeechLines("   ", 100), []);
  });

  it("packs whole sentences together while they fit", () => {
    const lines = splitIntoSpeechLines("One. Two. Three.", 100);

    assert.deepEqual(lines, ["One. Two. Three."]);
  });

  it("starts a new line rather than passing the limit", () => {
    const lines = splitIntoSpeechLines("One two three. Four five six.", 20);

    assert.deepEqual(lines, ["One two three.", "Four five six."]);
  });

  it("never returns a line over the limit", () => {
    const longNarration = "A queue holds work that a worker takes one job at a time. ".repeat(10);

    for (const line of splitIntoSpeechLines(longNarration, 40)) {
      assert.ok(line.length <= 40, `Line is ${line.length} characters: ${line}`);
    }
  });

  it("cuts a sentence that is longer than a whole line", () => {
    const lines = splitIntoSpeechLines("one two three four five six seven eight", 12);

    for (const line of lines) {
      assert.ok(line.length <= 12);
    }
    assert.ok(lines.length > 1);
  });

  it("cuts a single word that is longer than a whole line", () => {
    const lines = splitIntoSpeechLines("supercalifragilistic", 8);

    assert.deepEqual(lines, ["supercal", "ifragili", "stic"]);
  });

  it("keeps every word, in order", () => {
    const narration = "A queue holds work. A worker takes one job at a time.";

    const rejoined = splitIntoSpeechLines(narration, 15).join(" ");

    assert.equal(rejoined, narration);
  });

  it("collapses stray whitespace so a line is measured by its words", () => {
    assert.deepEqual(splitIntoSpeechLines("A  queue\n holds\twork.", 100), [
      "A queue holds work.",
    ]);
  });
});
