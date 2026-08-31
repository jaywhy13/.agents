import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MultipleChoiceQuizBeat, ShortTextQuizBeat } from "../shared/beat.ts";
import { MAXIMUM_ANSWER_CHARACTERS } from "../shared/client-message.ts";
import {
  emptyDraftFor,
  quizAnswerSubmissionFrom,
  withChoiceToggled,
} from "../shared/quiz-answer-draft.ts";

function multipleChoiceQuizBeat(
  overrides: Partial<MultipleChoiceQuizBeat> = {},
): MultipleChoiceQuizBeat {
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
      { choiceId: "c", text: "The name of the worker" },
    ],
    correctChoiceIds: ["a"],
    ...overrides,
  };
}

function shortTextQuizBeat(overrides: Partial<ShortTextQuizBeat> = {}): ShortTextQuizBeat {
  return {
    kind: "quiz",
    beatId: "beat-2",
    lessonId: "lesson-1",
    sequenceNumber: 2,
    createdAt: "2024-05-01T10:00:00.000Z",
    questionId: "queue-order-2",
    question: "Say in your own words what a queue is for.",
    explanation: "A queue holds work until a worker is free.",
    relatedTerms: ["queue"],
    answerFormat: "short_text",
    correctAnswerCriteria: "Says that work waits until a worker can take it.",
    ...overrides,
  };
}

describe("emptyDraftFor", () => {
  it("starts a multiple choice question with nothing chosen", () => {
    assert.deepEqual(emptyDraftFor(multipleChoiceQuizBeat()), {
      kind: "chosen_choices",
      selectedChoiceIds: [],
    });
  });

  it("starts a free text question with an empty answer", () => {
    assert.deepEqual(emptyDraftFor(shortTextQuizBeat()), { kind: "written_answer", text: "" });
  });
});

describe("withChoiceToggled", () => {
  it("adds a choice the learner picked", () => {
    const draft = withChoiceToggled(emptyDraftFor(multipleChoiceQuizBeat()), "a");

    assert.deepEqual(draft, { kind: "chosen_choices", selectedChoiceIds: ["a"] });
  });

  it("removes a choice the learner picked again", () => {
    const draftWithChoice = withChoiceToggled(emptyDraftFor(multipleChoiceQuizBeat()), "a");

    assert.deepEqual(withChoiceToggled(draftWithChoice, "a"), {
      kind: "chosen_choices",
      selectedChoiceIds: [],
    });
  });

  it("keeps every choice the learner picked, so more than one answer can be given", () => {
    const draftWithFirstChoice = withChoiceToggled(emptyDraftFor(multipleChoiceQuizBeat()), "a");

    assert.deepEqual(withChoiceToggled(draftWithFirstChoice, "b"), {
      kind: "chosen_choices",
      selectedChoiceIds: ["a", "b"],
    });
  });

  it("leaves a written answer alone, because it has no choices", () => {
    const writtenDraft = { kind: "written_answer", text: "Work waits." } as const;

    assert.deepEqual(withChoiceToggled(writtenDraft, "a"), writtenDraft);
  });
});

describe("quizAnswerSubmissionFrom for a multiple choice question", () => {
  it("sends the choices the learner picked", () => {
    const draft = withChoiceToggled(emptyDraftFor(multipleChoiceQuizBeat()), "a");

    assert.deepEqual(quizAnswerSubmissionFrom(multipleChoiceQuizBeat(), draft), {
      format: "multiple_choice",
      selectedChoiceIds: ["a"],
    });
  });

  it("is not ready while nothing is picked", () => {
    const emptyDraft = emptyDraftFor(multipleChoiceQuizBeat());

    assert.equal(quizAnswerSubmissionFrom(multipleChoiceQuizBeat(), emptyDraft), null);
  });

  it("is not ready when a choice is not one the question offered", () => {
    const draftWithUnknownChoice = {
      kind: "chosen_choices",
      selectedChoiceIds: ["z"],
    } as const;

    assert.equal(
      quizAnswerSubmissionFrom(multipleChoiceQuizBeat(), draftWithUnknownChoice),
      null,
    );
  });

  it("is not ready when the draft is a written answer", () => {
    const writtenDraft = { kind: "written_answer", text: "Work waits." } as const;

    assert.equal(quizAnswerSubmissionFrom(multipleChoiceQuizBeat(), writtenDraft), null);
  });
});

describe("quizAnswerSubmissionFrom for a free text question", () => {
  it("sends what the learner wrote", () => {
    const draft = { kind: "written_answer", text: "Work waits for a free worker." } as const;

    assert.deepEqual(quizAnswerSubmissionFrom(shortTextQuizBeat(), draft), {
      format: "short_text",
      text: "Work waits for a free worker.",
    });
  });

  it("trims the answer, so trailing spaces do not reach the lesson", () => {
    const draft = { kind: "written_answer", text: "  Work waits.  " } as const;

    assert.deepEqual(quizAnswerSubmissionFrom(shortTextQuizBeat(), draft), {
      format: "short_text",
      text: "Work waits.",
    });
  });

  it("is not ready while the answer is blank", () => {
    const blankDraft = { kind: "written_answer", text: "   " } as const;

    assert.equal(quizAnswerSubmissionFrom(shortTextQuizBeat(), blankDraft), null);
  });

  it("is not ready when the answer is longer than the lesson accepts", () => {
    const tooLongDraft = {
      kind: "written_answer",
      text: "a".repeat(MAXIMUM_ANSWER_CHARACTERS + 1),
    } as const;

    assert.equal(quizAnswerSubmissionFrom(shortTextQuizBeat(), tooLongDraft), null);
  });

  it("is not ready when the draft holds choices", () => {
    const chosenDraft = { kind: "chosen_choices", selectedChoiceIds: ["a"] } as const;

    assert.equal(quizAnswerSubmissionFrom(shortTextQuizBeat(), chosenDraft), null);
  });
});
