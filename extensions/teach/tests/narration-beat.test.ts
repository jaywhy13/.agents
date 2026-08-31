import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NARRATION_CHUNK_KINDS, parseBeat, parseNarrationBeat } from "../shared/beat.ts";
import { narrationPlainText } from "../shared/narration.ts";

function narrationPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "narration",
    beatId: "beat-3",
    lessonId: "lesson-1",
    sequenceNumber: 3,
    createdAt: "2024-05-01T10:00:00.000Z",
    relatedBeatId: "beat-2",
    chunks: [
      { kind: "sentence", text: "A queue holds work until a worker is free." },
      { kind: "term", text: "queue" },
    ],
    ...overrides,
  };
}

describe("parseNarrationBeat", () => {
  it("returns typed chunks for a valid payload", () => {
    const beat = parseNarrationBeat(narrationPayload());

    assert.equal(beat.kind, "narration");
    assert.deepEqual(beat.chunks, [
      { kind: "sentence", text: "A queue holds work until a worker is free." },
      { kind: "term", text: "queue" },
    ]);
  });

  it("ties the narration to the beat it speaks", () => {
    const beat = parseNarrationBeat(narrationPayload());

    assert.equal(beat.relatedBeatId, "beat-2");
  });

  it("rejects narration that is not tied to a beat, because speech alone is not a lesson", () => {
    assert.throws(
      () => parseNarrationBeat(narrationPayload({ relatedBeatId: "" })),
      /relatedBeatId/,
    );
  });

  it("rejects narration with no chunks", () => {
    assert.throws(() => parseNarrationBeat(narrationPayload({ chunks: [] })), /chunks/);
  });

  it("rejects a chunk kind the speech layer would not know what to do with", () => {
    assert.throws(
      () => parseNarrationBeat(narrationPayload({ chunks: [{ kind: "shout", text: "Hello." }] })),
      /kind/,
    );
  });

  it("rejects a chunk with no words in it", () => {
    assert.throws(
      () => parseNarrationBeat(narrationPayload({ chunks: [{ kind: "sentence", text: "  " }] })),
      /text/,
    );
  });

  it("is reached through parseBeat, so a stored narration beat can be replayed", () => {
    assert.equal(parseBeat(narrationPayload()).kind, "narration");
  });

  it("names the chunk kinds the later speech step can act on", () => {
    assert.deepEqual(NARRATION_CHUNK_KINDS, ["sentence", "emphasis", "term"]);
  });
});

describe("narrationPlainText", () => {
  it("joins the chunks into the words that will be spoken", () => {
    const beat = parseNarrationBeat(narrationPayload());

    assert.equal(
      narrationPlainText(beat.chunks),
      "A queue holds work until a worker is free. queue",
    );
  });
});
