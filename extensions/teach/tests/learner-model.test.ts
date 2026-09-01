import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  LearnerSignal,
  PauseDwell,
  QuizAttempt,
  QuizGrade,
} from "../shared/learner-history.ts";
import {
  DEEPEST_DEPTH_LEVEL,
  deriveLearnerModel,
  SHALLOWEST_DEPTH_LEVEL,
  STARTING_DEPTH_LEVEL,
} from "../src/domain/learner-model.ts";

let attemptNumber = 0;

function quizAttempt(overrides: Partial<QuizAttempt> = {}): QuizAttempt {
  attemptNumber += 1;
  return {
    attemptId: `attempt-${attemptNumber}`,
    lessonId: "lesson-1",
    beatId: "beat-5",
    questionId: "queue-order-1",
    answerFormat: "multiple_choice",
    submittedAnswer: "a",
    selectedChoiceIds: ["a"],
    grade: "correct",
    gradedBy: "lesson_server",
    explanation: "A queue keeps the order work arrived in.",
    relatedTerms: [],
    answeredAt: "2024-05-01T10:00:00.000Z",
    ...overrides,
  };
}

function pauseDwell(overrides: Partial<PauseDwell> = {}): PauseDwell {
  return {
    lessonId: "lesson-1",
    beatId: "beat-7",
    suggestedWaitSeconds: 20,
    actualWaitSeconds: 20,
    resumedAt: "2024-05-01T10:00:30.000Z",
    ...overrides,
  };
}

function learnerSignal(overrides: Partial<LearnerSignal> = {}): LearnerSignal {
  return {
    lessonId: "lesson-1",
    signal: "simpler",
    askedAt: "2024-05-01T10:01:00.000Z",
    ...overrides,
  };
}

function depthAfter(grades: readonly QuizGrade[]): number {
  return deriveLearnerModel({
    quizAttempts: grades.map((grade) => quizAttempt({ grade })),
    pauseDwells: [],
    learnerSignals: [],
  }).depthLevel;
}

describe("deriveLearnerModel depth", () => {
  it("starts at the shallow end of the middle, because a new learner has said nothing yet", () => {
    const model = deriveLearnerModel({ quizAttempts: [], pauseDwells: [], learnerSignals: [] });

    assert.equal(model.depthLevel, STARTING_DEPTH_LEVEL);
  });

  it("goes deeper after a correct answer", () => {
    assert.equal(depthAfter(["correct"]), STARTING_DEPTH_LEVEL + 1);
  });

  it("comes back a step after a partly correct answer, because the learner is unsure", () => {
    assert.equal(depthAfter(["partly_correct"]), STARTING_DEPTH_LEVEL - 1);
  });

  it("comes back two steps after a wrong answer", () => {
    assert.equal(depthAfter(["correct", "correct", "incorrect"]), STARTING_DEPTH_LEVEL + 2 - 2);
  });

  it("never goes below the simplest depth, however many answers are wrong", () => {
    assert.equal(
      depthAfter(["incorrect", "incorrect", "incorrect", "incorrect"]),
      SHALLOWEST_DEPTH_LEVEL,
    );
  });

  it("never goes above the deepest depth, however many answers are right", () => {
    assert.equal(
      depthAfter(["correct", "correct", "correct", "correct", "correct", "correct"]),
      DEEPEST_DEPTH_LEVEL,
    );
  });

  it("counts how many questions the learner has answered", () => {
    const model = deriveLearnerModel({
      quizAttempts: [quizAttempt(), quizAttempt()],
      pauseDwells: [],
      learnerSignals: [],
    });

    assert.equal(model.answeredQuestionCount, 2);
  });
});

describe("deriveLearnerModel terms", () => {
  it("counts a term the learner answered correctly as known", () => {
    const model = deriveLearnerModel({
      quizAttempts: [quizAttempt({ grade: "correct", relatedTerms: ["queue"] })],
      pauseDwells: [],
      learnerSignals: [],
    });

    assert.deepEqual(model.knownTerms, ["queue"]);
    assert.deepEqual(model.shakyTerms, []);
  });

  it("counts a term the learner got wrong as shaky", () => {
    const model = deriveLearnerModel({
      quizAttempts: [quizAttempt({ grade: "incorrect", relatedTerms: ["queue"] })],
      pauseDwells: [],
      learnerSignals: [],
    });

    assert.deepEqual(model.shakyTerms, ["queue"]);
    assert.deepEqual(model.knownTerms, []);
  });

  it("counts a term the learner was only partly right about as shaky", () => {
    const model = deriveLearnerModel({
      quizAttempts: [quizAttempt({ grade: "partly_correct", relatedTerms: ["queue"] })],
      pauseDwells: [],
      learnerSignals: [],
    });

    assert.deepEqual(model.shakyTerms, ["queue"]);
  });

  it("lets a later correct answer move a shaky term to known", () => {
    const model = deriveLearnerModel({
      quizAttempts: [
        quizAttempt({ grade: "incorrect", relatedTerms: ["queue"] }),
        quizAttempt({ grade: "correct", relatedTerms: ["queue"] }),
      ],
      pauseDwells: [],
      learnerSignals: [],
    });

    assert.deepEqual(model.knownTerms, ["queue"]);
    assert.deepEqual(model.shakyTerms, []);
  });

  it("lets a later wrong answer move a known term back to shaky", () => {
    const model = deriveLearnerModel({
      quizAttempts: [
        quizAttempt({ grade: "correct", relatedTerms: ["queue"] }),
        quizAttempt({ grade: "incorrect", relatedTerms: ["queue"] }),
      ],
      pauseDwells: [],
      learnerSignals: [],
    });

    assert.deepEqual(model.shakyTerms, ["queue"]);
  });

  it("treats the same term written with different capitals as one term", () => {
    const model = deriveLearnerModel({
      quizAttempts: [
        quizAttempt({ grade: "correct", relatedTerms: ["Queue"] }),
        quizAttempt({ grade: "correct", relatedTerms: ["queue"] }),
      ],
      pauseDwells: [],
      learnerSignals: [],
    });

    assert.equal(model.knownTerms.length, 1);
  });

  it("lists terms alphabetically, so the same history always reads the same way", () => {
    const model = deriveLearnerModel({
      quizAttempts: [quizAttempt({ grade: "correct", relatedTerms: ["worker", "broker"] })],
      pauseDwells: [],
      learnerSignals: [],
    });

    assert.deepEqual(model.knownTerms, ["broker", "worker"]);
  });
});

describe("deriveLearnerModel pace", () => {
  it("is steady before the learner has paused anywhere", () => {
    const model = deriveLearnerModel({ quizAttempts: [], pauseDwells: [], learnerSignals: [] });

    assert.equal(model.pacePreference, "steady");
  });

  it("is steady when the learner waits about as long as suggested", () => {
    const model = deriveLearnerModel({
      quizAttempts: [],
      pauseDwells: [pauseDwell({ suggestedWaitSeconds: 20, actualWaitSeconds: 22 })],
      learnerSignals: [],
    });

    assert.equal(model.pacePreference, "steady");
  });

  it("asks for a slower pace when the learner stays much longer than suggested", () => {
    const model = deriveLearnerModel({
      quizAttempts: [],
      pauseDwells: [
        pauseDwell({ suggestedWaitSeconds: 20, actualWaitSeconds: 60 }),
        pauseDwell({ suggestedWaitSeconds: 20, actualWaitSeconds: 50 }),
      ],
      learnerSignals: [],
    });

    assert.equal(model.pacePreference, "slower");
  });

  it("asks for a faster pace when the learner moves on well before the suggestion", () => {
    const model = deriveLearnerModel({
      quizAttempts: [],
      pauseDwells: [
        pauseDwell({ suggestedWaitSeconds: 20, actualWaitSeconds: 4 }),
        pauseDwell({ suggestedWaitSeconds: 20, actualWaitSeconds: 6 }),
      ],
      learnerSignals: [],
    });

    assert.equal(model.pacePreference, "faster");
  });

  it("ignores a dwell that suggested no wait at all, so it cannot divide by zero", () => {
    const model = deriveLearnerModel({
      quizAttempts: [],
      pauseDwells: [pauseDwell({ suggestedWaitSeconds: 0, actualWaitSeconds: 90 })],
      learnerSignals: [],
    });

    assert.equal(model.pacePreference, "steady");
  });
});

/**
 * A grade and a dwell are inferences about the learner. These two are not: the
 * learner pressed a button that says exactly what they want. So they outrank the
 * inferences, and nothing here reads anything else into them.
 */
describe("deriveLearnerModel and what the learner asked for outright", () => {
  it("has nothing to report before the learner has asked for anything", () => {
    const model = deriveLearnerModel({ quizAttempts: [], pauseDwells: [], learnerSignals: [] });

    assert.equal(model.latestLearnerSignal, null);
  });

  it("teaches one step plainer when the learner asks for it simpler", () => {
    const model = deriveLearnerModel({
      quizAttempts: [],
      pauseDwells: [],
      learnerSignals: [learnerSignal({ signal: "simpler" })],
    });

    assert.equal(model.depthLevel, STARTING_DEPTH_LEVEL - 1);
  });

  it("teaches one step deeper when the learner asks to go deeper", () => {
    const model = deriveLearnerModel({
      quizAttempts: [],
      pauseDwells: [],
      learnerSignals: [learnerSignal({ signal: "go_deeper" })],
    });

    assert.equal(model.depthLevel, STARTING_DEPTH_LEVEL + 1);
  });

  it("goes another step each time the learner asks again", () => {
    const model = deriveLearnerModel({
      quizAttempts: [],
      pauseDwells: [],
      learnerSignals: [
        learnerSignal({ signal: "go_deeper" }),
        learnerSignal({ signal: "go_deeper" }),
      ],
    });

    assert.equal(model.depthLevel, STARTING_DEPTH_LEVEL + 2);
  });

  it("lets the learner ask their way back, without wiping out what the quizzes said", () => {
    const model = deriveLearnerModel({
      quizAttempts: [quizAttempt({ grade: "correct" })],
      pauseDwells: [],
      learnerSignals: [
        learnerSignal({ signal: "go_deeper" }),
        learnerSignal({ signal: "simpler" }),
      ],
    });

    assert.equal(model.depthLevel, STARTING_DEPTH_LEVEL + 1);
  });

  it("never goes below the simplest depth, however often the learner asks", () => {
    const model = deriveLearnerModel({
      quizAttempts: [],
      pauseDwells: [],
      learnerSignals: [
        learnerSignal({ signal: "simpler" }),
        learnerSignal({ signal: "simpler" }),
        learnerSignal({ signal: "simpler" }),
        learnerSignal({ signal: "simpler" }),
      ],
    });

    assert.equal(model.depthLevel, SHALLOWEST_DEPTH_LEVEL);
  });

  it("never goes above the deepest depth, however often the learner asks", () => {
    const model = deriveLearnerModel({
      quizAttempts: [],
      pauseDwells: [],
      learnerSignals: Array.from({ length: 8 }, () => learnerSignal({ signal: "go_deeper" })),
    });

    assert.equal(model.depthLevel, DEEPEST_DEPTH_LEVEL);
  });

  it("slows the pace down when the learner asked for it simpler", () => {
    const model = deriveLearnerModel({
      quizAttempts: [],
      pauseDwells: [],
      learnerSignals: [learnerSignal({ signal: "simpler" })],
    });

    assert.equal(model.pacePreference, "slower");
  });

  it("lets what the learner asked for beat what their pauses suggested", () => {
    const dwellsThatSuggestASlowerPace = [
      pauseDwell({ suggestedWaitSeconds: 20, actualWaitSeconds: 60 }),
      pauseDwell({ suggestedWaitSeconds: 20, actualWaitSeconds: 50 }),
    ];

    const model = deriveLearnerModel({
      quizAttempts: [],
      pauseDwells: dwellsThatSuggestASlowerPace,
      learnerSignals: [learnerSignal({ signal: "go_deeper" })],
    });

    assert.equal(model.pacePreference, "faster");
  });

  it("reports the newest request, so the next turn can answer it plainly", () => {
    const model = deriveLearnerModel({
      quizAttempts: [],
      pauseDwells: [],
      learnerSignals: [
        learnerSignal({ signal: "go_deeper" }),
        learnerSignal({ signal: "simpler" }),
      ],
    });

    assert.equal(model.latestLearnerSignal, "simpler");
  });
});
