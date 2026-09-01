import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Beat, ConceptCardBeat, NarrationBeat, PauseBeat } from "../shared/beat.ts";
import { beatsShownOnScreen } from "../shared/beats-on-screen.ts";

function conceptCardBeat(beatId: string, sequenceNumber: number): ConceptCardBeat {
  return {
    kind: "concept_card",
    beatId,
    lessonId: "lesson-1",
    sequenceNumber,
    createdAt: "2024-05-01T10:00:00.000Z",
    title: "What a queue is",
    plainLanguageSummary: "A queue holds work until a worker is free.",
    keyPoints: ["Work waits in line."],
    narrationScript: "A queue holds work until a worker is free.",
    pauseForLearner: true,
  };
}

function narrationBeat(beatId: string, relatedBeatId: string): NarrationBeat {
  return {
    kind: "narration",
    beatId,
    lessonId: "lesson-1",
    sequenceNumber: 2,
    createdAt: "2024-05-01T10:00:00.000Z",
    relatedBeatId,
    chunks: [{ kind: "sentence", text: "A queue holds work until a worker is free." }],
  };
}

function pauseBeat(beatId: string): PauseBeat {
  return {
    kind: "pause",
    beatId,
    lessonId: "lesson-1",
    sequenceNumber: 3,
    createdAt: "2024-05-01T10:00:00.000Z",
    reason: "Have a think about where the work waits.",
    suggestedWaitSeconds: 30,
  };
}

describe("beatsShownOnScreen", () => {
  it("leaves out narration, which is spoken rather than drawn", () => {
    const beats: readonly Beat[] = [
      conceptCardBeat("beat-1", 1),
      narrationBeat("beat-2", "beat-1"),
    ];

    assert.deepEqual(
      beatsShownOnScreen(beats).map((beat) => beat.beatId),
      ["beat-1"],
    );
  });

  it("keeps every other beat in the order it was taught", () => {
    const beats: readonly Beat[] = [
      conceptCardBeat("beat-1", 1),
      narrationBeat("beat-2", "beat-1"),
      pauseBeat("beat-3"),
    ];

    assert.deepEqual(
      beatsShownOnScreen(beats).map((beat) => beat.beatId),
      ["beat-1", "beat-3"],
    );
  });

  it("shows nothing for a lesson that has only been narrated", () => {
    assert.deepEqual(beatsShownOnScreen([narrationBeat("beat-1", "beat-0")]), []);
  });
});
