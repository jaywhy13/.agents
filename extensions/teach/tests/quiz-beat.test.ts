import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBeat, parseQuizBeat } from "../shared/beat.ts";

function multipleChoicePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "quiz",
    beatId: "beat-5",
    lessonId: "lesson-1",
    sequenceNumber: 5,
    createdAt: "2024-05-01T10:00:00.000Z",
    questionId: "queue-order-1",
    question: "Which item does a worker take first?",
    answerFormat: "multiple_choice",
    choices: [
      { choiceId: "a", text: "The oldest item." },
      { choiceId: "b", text: "The newest item." },
    ],
    correctChoiceIds: ["a"],
    explanation: "A queue is served in the order things arrived.",
    relatedTerms: ["queue"],
    ...overrides,
  };
}

function shortTextPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "quiz",
    beatId: "beat-6",
    lessonId: "lesson-1",
    sequenceNumber: 6,
    createdAt: "2024-05-01T10:00:00.000Z",
    questionId: "queue-purpose-1",
    question: "In your own words, why does a queue help?",
    answerFormat: "short_text",
    correctAnswerCriteria: "Says work can wait without being lost while workers are busy.",
    explanation: "A queue lets work wait instead of being dropped.",
    relatedTerms: ["queue"],
    ...overrides,
  };
}

describe("parseQuizBeat for a multiple choice question", () => {
  it("returns typed choices and the correct answers", () => {
    const beat = parseQuizBeat(multipleChoicePayload());

    assert.equal(beat.answerFormat, "multiple_choice");
    if (beat.answerFormat !== "multiple_choice") return;
    assert.deepEqual(
      beat.choices.map((choice) => choice.choiceId),
      ["a", "b"],
    );
    assert.deepEqual(beat.correctChoiceIds, ["a"]);
  });

  it("keeps the question id the learner's answer will name", () => {
    assert.equal(parseQuizBeat(multipleChoicePayload()).questionId, "queue-order-1");
  });

  it("rejects a question id that could not be used as a stable name", () => {
    assert.throws(
      () => parseQuizBeat(multipleChoicePayload({ questionId: "../../etc/passwd" })),
      /questionId/,
    );
  });

  it("rejects a single choice, because one choice is not a question", () => {
    assert.throws(
      () =>
        parseQuizBeat(
          multipleChoicePayload({ choices: [{ choiceId: "a", text: "The oldest item." }] }),
        ),
      /choices/,
    );
  });

  it("rejects two choices that share an identifier, because grading could not tell them apart", () => {
    assert.throws(
      () =>
        parseQuizBeat(
          multipleChoicePayload({
            choices: [
              { choiceId: "a", text: "The oldest item." },
              { choiceId: "a", text: "The newest item." },
            ],
          }),
        ),
      /choiceId/,
    );
  });

  it("rejects a correct answer that is not one of the choices", () => {
    assert.throws(
      () => parseQuizBeat(multipleChoicePayload({ correctChoiceIds: ["z"] })),
      /correctChoiceIds/,
    );
  });

  it("rejects a question with no correct answer at all", () => {
    assert.throws(
      () => parseQuizBeat(multipleChoicePayload({ correctChoiceIds: [] })),
      /correctChoiceIds/,
    );
  });

  it("rejects a question with no explanation to show afterwards", () => {
    assert.throws(
      () => parseQuizBeat(multipleChoicePayload({ explanation: "" })),
      /explanation/,
    );
  });
});

describe("parseQuizBeat for a short free text question", () => {
  it("returns the criteria the answer will be judged against", () => {
    const beat = parseQuizBeat(shortTextPayload());

    assert.equal(beat.answerFormat, "short_text");
    if (beat.answerFormat !== "short_text") return;
    assert.equal(
      beat.correctAnswerCriteria,
      "Says work can wait without being lost while workers are busy.",
    );
  });

  it("rejects a free text question with no criteria, because nothing could grade it", () => {
    assert.throws(
      () => parseQuizBeat(shortTextPayload({ correctAnswerCriteria: "  " })),
      /correctAnswerCriteria/,
    );
  });

  it("keeps the glossary terms the question tests, which is what the learner model tracks", () => {
    assert.deepEqual(parseQuizBeat(shortTextPayload()).relatedTerms, ["queue"]);
  });

  it("allows a question that tests no named term", () => {
    assert.deepEqual(parseQuizBeat(shortTextPayload({ relatedTerms: undefined })).relatedTerms, []);
  });
});

describe("parseQuizBeat", () => {
  it("rejects an answer format the page could not draw", () => {
    assert.throws(
      () => parseQuizBeat(multipleChoicePayload({ answerFormat: "essay" })),
      /answerFormat/,
    );
  });

  it("is reached through parseBeat, so a stored quiz beat can be replayed", () => {
    assert.equal(parseBeat(multipleChoicePayload()).kind, "quiz");
  });
});
