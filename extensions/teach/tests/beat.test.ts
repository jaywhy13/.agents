import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BEAT_KINDS, isBeatKind, parseBeat } from "../shared/beat.ts";

function conceptCardPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "concept_card",
    beatId: "beat-1",
    lessonId: "lesson-1",
    sequenceNumber: 1,
    createdAt: "2024-05-01T10:00:00.000Z",
    title: "What a queue is",
    plainLanguageSummary: "A queue holds work until a worker is free.",
    keyPoints: ["Work waits in line.", "Workers take the oldest item first."],
    narrationScript: "A queue holds work until a worker is free.",
    pauseForLearner: true,
    ...overrides,
  };
}

describe("parseBeat", () => {
  it("returns a typed concept card beat for a valid payload", () => {
    const beat = parseBeat(conceptCardPayload());

    assert.equal(beat.kind, "concept_card");
    assert.equal(beat.title, "What a queue is");
    assert.deepEqual(beat.keyPoints, [
      "Work waits in line.",
      "Workers take the oldest item first.",
    ]);
    assert.equal(beat.pauseForLearner, true);
  });

  it("rejects a concept card whose title is blank", () => {
    assert.throws(() => parseBeat(conceptCardPayload({ title: "   " })), /title/);
  });

  it("rejects a concept card with no key points", () => {
    assert.throws(() => parseBeat(conceptCardPayload({ keyPoints: [] })), /keyPoints/);
  });

  it("rejects a beat kind that is not part of the domain", () => {
    assert.throws(() => parseBeat({ kind: "interpretive_dance" }), /interpretive_dance/);
    assert.equal(isBeatKind("interpretive_dance"), false);
  });

  it("has a parse branch for every beat kind, so none is reserved but unbuilt", () => {
    for (const kind of BEAT_KINDS) {
      // Every kind is refused for missing fields, never for being unimplemented.
      assert.throws(
        () => parseBeat({ kind }),
        (error: unknown) =>
          error instanceof Error && !/not implemented/i.test(error.message),
        `beat kind ${kind} has no parse branch`,
      );
    }
  });

  it("reserves every planned beat kind in the domain", () => {
    assert.deepEqual(BEAT_KINDS, [
      "concept_card",
      "definition",
      "code",
      "diagram",
      "image",
      "quiz",
      "pause",
      "narration",
      "lesson_end",
    ]);
  });
});
