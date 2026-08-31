import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  ConceptCardBeat,
  MultipleChoiceQuizBeat,
  ShortTextQuizBeat,
} from "../shared/beat.ts";
import { beatForBrowser, beatsForBrowser } from "../shared/browser-beat.ts";

function envelope(beatId: string, sequenceNumber: number) {
  return {
    beatId,
    lessonId: "lesson-1",
    sequenceNumber,
    createdAt: "2024-05-01T10:00:00.000Z",
  };
}

function multipleChoiceQuizBeat(): MultipleChoiceQuizBeat {
  return {
    kind: "quiz",
    ...envelope("beat-2", 2),
    questionId: "queue-order-1",
    question: "Which item does a worker take first?",
    answerFormat: "multiple_choice",
    choices: [
      { choiceId: "a", text: "The oldest" },
      { choiceId: "b", text: "The newest" },
    ],
    correctChoiceIds: ["a"],
    explanation: "A queue is first in, first out.",
    relatedTerms: ["queue"],
  };
}

function shortTextQuizBeat(): ShortTextQuizBeat {
  return {
    kind: "quiz",
    ...envelope("beat-3", 3),
    questionId: "queue-order-2",
    question: "Why does a queue help?",
    answerFormat: "short_text",
    correctAnswerCriteria: "Says work waits instead of being lost.",
    explanation: "Work waits instead of being lost.",
    relatedTerms: ["queue"],
  };
}

function conceptCardBeat(): ConceptCardBeat {
  return {
    kind: "concept_card",
    ...envelope("beat-1", 1),
    title: "What a queue is",
    plainLanguageSummary: "A queue holds work until a worker is free.",
    keyPoints: ["Work waits in line."],
    narrationScript: "A queue holds work until a worker is free.",
    pauseForLearner: true,
  };
}

describe("beatForBrowser", () => {
  it("drops which choices are right, so the answer key never reaches the learner", () => {
    const forBrowser = beatForBrowser(multipleChoiceQuizBeat());

    assert.equal("correctChoiceIds" in forBrowser, false);
    assert.match(JSON.stringify(forBrowser), /queue-order-1/);
    assert.doesNotMatch(JSON.stringify(forBrowser), /correctChoiceIds/);
  });

  it("keeps the question and the choices, which the learner has to see", () => {
    const forBrowser = beatForBrowser(multipleChoiceQuizBeat());

    assert.equal(forBrowser.kind, "quiz");
    if (forBrowser.kind !== "quiz" || forBrowser.answerFormat !== "multiple_choice") {
      throw new Error("expected a multiple choice quiz beat");
    }
    assert.deepEqual(
      forBrowser.choices.map((choice) => choice.choiceId),
      ["a", "b"],
    );
    assert.equal(forBrowser.question, "Which item does a worker take first?");
  });

  it("drops what a written answer has to say, so the learner cannot read the marking scheme", () => {
    const forBrowser = beatForBrowser(shortTextQuizBeat());

    assert.equal("correctAnswerCriteria" in forBrowser, false);
    assert.doesNotMatch(JSON.stringify(forBrowser), /correctAnswerCriteria/);
    assert.doesNotMatch(JSON.stringify(forBrowser), /Says work waits/);
  });

  it("leaves a beat that has no answer key exactly as it is", () => {
    const beat = conceptCardBeat();

    assert.deepEqual(beatForBrowser(beat), beat);
  });

  it("redacts every quiz beat in a list, whichever way it is answered", () => {
    const forBrowser = beatsForBrowser([
      conceptCardBeat(),
      multipleChoiceQuizBeat(),
      shortTextQuizBeat(),
    ]);

    assert.equal(forBrowser.length, 3);
    assert.doesNotMatch(JSON.stringify(forBrowser), /correctChoiceIds|correctAnswerCriteria/);
  });
});
