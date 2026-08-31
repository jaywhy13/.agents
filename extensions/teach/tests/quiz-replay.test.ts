import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Beat, MultipleChoiceQuizBeat, ShortTextQuizBeat } from "../shared/beat.ts";
import type { QuizAttempt } from "../shared/learner-history.ts";
import { quizResultsFromAttempts } from "../shared/quiz-replay.ts";

function multipleChoiceQuizBeat(): MultipleChoiceQuizBeat {
  return {
    kind: "quiz",
    beatId: "beat-1",
    lessonId: "lesson-1",
    sequenceNumber: 1,
    createdAt: "2024-05-01T10:00:00.000Z",
    questionId: "queue-order-1",
    question: "What does a queue keep?",
    explanation: "A queue keeps the order work arrived in.",
    relatedTerms: ["queue"],
    answerFormat: "multiple_choice",
    choices: [
      { choiceId: "a", text: "The order work arrived in" },
      { choiceId: "b", text: "The size of each job" },
    ],
    correctChoiceIds: ["a"],
  };
}

function shortTextQuizBeat(): ShortTextQuizBeat {
  return {
    kind: "quiz",
    beatId: "beat-2",
    lessonId: "lesson-1",
    sequenceNumber: 2,
    createdAt: "2024-05-01T10:00:00.000Z",
    questionId: "queue-purpose-1",
    question: "Why does a queue help?",
    explanation: "A queue lets work wait.",
    relatedTerms: ["queue"],
    answerFormat: "short_text",
    correctAnswerCriteria: "Says work can wait instead of being lost.",
  };
}

function quizAttempt(overrides: Partial<QuizAttempt> = {}): QuizAttempt {
  return {
    attemptId: "attempt-1",
    lessonId: "lesson-1",
    beatId: "beat-1",
    questionId: "queue-order-1",
    answerFormat: "multiple_choice",
    submittedAnswer: "The order work arrived in",
    selectedChoiceIds: ["a"],
    grade: "correct",
    gradedBy: "lesson_server",
    explanation: "A queue keeps the order work arrived in.",
    relatedTerms: ["queue"],
    answeredAt: "2024-05-01T10:05:00.000Z",
    ...overrides,
  };
}

describe("quizResultsFromAttempts", () => {
  it("gives a reloaded page back the grade and the explanation the learner saw", () => {
    const beats: readonly Beat[] = [multipleChoiceQuizBeat()];

    assert.deepEqual(quizResultsFromAttempts(beats, [quizAttempt()]), [
      {
        questionId: "queue-order-1",
        grade: "correct",
        explanation: "A queue keeps the order work arrived in.",
        correctChoiceIds: ["a"],
      },
    ]);
  });

  it("names no correct choices for a question answered in the learner's own words", () => {
    const beats: readonly Beat[] = [shortTextQuizBeat()];
    const attempt = quizAttempt({
      beatId: "beat-2",
      questionId: "queue-purpose-1",
      answerFormat: "short_text",
      gradedBy: "teaching_agent",
      explanation: "You said the important part.",
      selectedChoiceIds: [],
    });

    assert.deepEqual(quizResultsFromAttempts(beats, [attempt]), [
      {
        questionId: "queue-purpose-1",
        grade: "correct",
        explanation: "You said the important part.",
        correctChoiceIds: [],
      },
    ]);
  });

  it("keeps only the newest attempt when a question was answered more than once", () => {
    const beats: readonly Beat[] = [multipleChoiceQuizBeat()];
    const attempts = [
      quizAttempt({ attemptId: "attempt-1", grade: "incorrect" }),
      quizAttempt({ attemptId: "attempt-2", grade: "correct" }),
    ];

    assert.deepEqual(
      quizResultsFromAttempts(beats, attempts).map((result) => result.grade),
      ["correct"],
    );
  });

  it("leaves out an attempt whose question is no longer in the lesson", () => {
    assert.deepEqual(quizResultsFromAttempts([], [quizAttempt()]), []);
  });
});
