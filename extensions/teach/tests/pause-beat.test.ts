import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LONGEST_SUGGESTED_WAIT_SECONDS,
  parseBeat,
  parseLessonEndBeat,
  parsePauseBeat,
} from "../shared/beat.ts";

function pausePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "pause",
    beatId: "beat-7",
    lessonId: "lesson-1",
    sequenceNumber: 7,
    createdAt: "2024-05-01T10:00:00.000Z",
    reason: "Read the two lines again before the next idea.",
    suggestedWaitSeconds: 20,
    ...overrides,
  };
}

function lessonEndPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "lesson_end",
    beatId: "beat-8",
    lessonId: "lesson-1",
    sequenceNumber: 8,
    createdAt: "2024-05-01T10:00:00.000Z",
    recap: "A queue holds work so workers are never idle and nothing is lost.",
    masteredConcepts: ["queue", "worker"],
    suggestedNextTopics: ["How a dead letter queue works"],
    ...overrides,
  };
}

describe("parsePauseBeat", () => {
  it("returns the reason the lesson stopped", () => {
    const beat = parsePauseBeat(pausePayload());

    assert.equal(beat.kind, "pause");
    assert.equal(beat.reason, "Read the two lines again before the next idea.");
  });

  it("returns how long the lesson suggests waiting", () => {
    assert.equal(parsePauseBeat(pausePayload()).suggestedWaitSeconds, 20);
  });

  it("rejects a pause with no reason, so the learner is never stopped without being told why", () => {
    assert.throws(() => parsePauseBeat(pausePayload({ reason: "" })), /reason/);
  });

  it("rejects a wait of zero seconds, which is not a pause", () => {
    assert.throws(
      () => parsePauseBeat(pausePayload({ suggestedWaitSeconds: 0 })),
      /suggestedWaitSeconds/,
    );
  });

  it("rejects a wait longer than a lesson would ever ask for", () => {
    assert.throws(
      () =>
        parsePauseBeat(
          pausePayload({ suggestedWaitSeconds: LONGEST_SUGGESTED_WAIT_SECONDS + 1 }),
        ),
      /suggestedWaitSeconds/,
    );
  });

  it("rejects a wait that is not a whole number of seconds", () => {
    assert.throws(
      () => parsePauseBeat(pausePayload({ suggestedWaitSeconds: 12.5 })),
      /suggestedWaitSeconds/,
    );
  });

  it("is reached through parseBeat, so a stored pause beat can be replayed", () => {
    assert.equal(parseBeat(pausePayload()).kind, "pause");
  });
});

describe("parseLessonEndBeat", () => {
  it("returns the recap, what was mastered, and what to learn next", () => {
    const beat = parseLessonEndBeat(lessonEndPayload());

    assert.equal(beat.kind, "lesson_end");
    assert.equal(beat.recap, "A queue holds work so workers are never idle and nothing is lost.");
    assert.deepEqual(beat.masteredConcepts, ["queue", "worker"]);
    assert.deepEqual(beat.suggestedNextTopics, ["How a dead letter queue works"]);
  });

  it("rejects an ending with no recap", () => {
    assert.throws(() => parseLessonEndBeat(lessonEndPayload({ recap: "   " })), /recap/);
  });

  it("allows a lesson that ended before anything was mastered", () => {
    assert.deepEqual(
      parseLessonEndBeat(lessonEndPayload({ masteredConcepts: [] })).masteredConcepts,
      [],
    );
  });

  it("allows a lesson that suggests nothing further", () => {
    assert.deepEqual(
      parseLessonEndBeat(lessonEndPayload({ suggestedNextTopics: undefined }))
        .suggestedNextTopics,
      [],
    );
  });

  it("is reached through parseBeat, so a stored ending can be replayed", () => {
    assert.equal(parseBeat(lessonEndPayload()).kind, "lesson_end");
  });
});
