import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import type { LessonMetadata } from "../shared/lesson.ts";
import type { QuizGrade } from "../shared/learner-history.ts";
import { BeatPublisher } from "../src/services/beat-publisher.ts";
import { LessonRepository } from "../src/services/lesson-repository.ts";
import { QuizGradingService } from "../src/services/quiz-grading-service.ts";
import { FakeBeatBroadcaster } from "./support/fake-beat-broadcaster.ts";

const LESSON_ID = "lesson-abc123";

interface Harness {
  readonly gradingService: QuizGradingService;
  readonly publisher: BeatPublisher;
  readonly repository: LessonRepository;
  readonly broadcaster: FakeBeatBroadcaster;
}

function lessonMetadata(): LessonMetadata {
  return {
    lessonId: LESSON_ID,
    topic: "How a message queue works",
    status: "teaching",
    createdAt: "2024-05-01T10:00:00.000Z",
    updatedAt: "2024-05-01T10:00:00.000Z",
    references: [],
    beatCount: 0,
  };
}

async function harness(): Promise<Harness> {
  const repository = new LessonRepository(await mkdtemp(path.join(tmpdir(), "teach-grading-")));
  await repository.saveLesson(lessonMetadata());
  const broadcaster = new FakeBeatBroadcaster();
  let beatNumber = 0;
  const publisher = new BeatPublisher({
    lessonId: LESSON_ID,
    lessonRepository: repository,
    beatBroadcaster: broadcaster,
    startingBeatCount: 0,
    now: () => new Date("2024-05-01T11:00:00.000Z"),
    createBeatId: () => `beat-${(beatNumber += 1)}`,
  });
  let attemptNumber = 0;
  const gradingService = new QuizGradingService({
    lessonId: LESSON_ID,
    lessonRepository: repository,
    beatBroadcaster: broadcaster,
    now: () => new Date("2024-05-01T11:05:00.000Z"),
    createAttemptId: () => `attempt-${(attemptNumber += 1)}`,
  });
  return { gradingService, publisher, repository, broadcaster };
}

async function harnessWithMultipleChoiceQuestion(): Promise<Harness> {
  const started = await harness();
  await started.publisher.publishQuiz({
    answerFormat: "multiple_choice",
    questionId: "queue-order-1",
    question: "Which items does a worker take first?",
    choices: [
      { choiceId: "a", text: "The oldest item." },
      { choiceId: "b", text: "The newest item." },
      { choiceId: "c", text: "The oldest item of the highest priority." },
    ],
    correctChoiceIds: ["a", "c"],
    explanation: "A queue is served in the order things arrived.",
    relatedTerms: ["queue"],
    narration: [],
  });
  return started;
}

async function harnessWithFreeTextQuestion(): Promise<Harness> {
  const started = await harness();
  await started.publisher.publishQuiz({
    answerFormat: "short_text",
    questionId: "queue-purpose-1",
    question: "Why does a queue help?",
    correctAnswerCriteria: "Says work can wait instead of being lost.",
    explanation: "A queue lets work wait instead of being dropped.",
    relatedTerms: ["queue"],
    narration: [],
  });
  return started;
}

async function gradeChoices(
  gradingService: QuizGradingService,
  selectedChoiceIds: readonly string[],
): Promise<QuizGrade> {
  const outcome = await gradingService.gradeAnswer("queue-order-1", {
    format: "multiple_choice",
    selectedChoiceIds,
  });
  assert.equal(outcome.kind, "graded");
  if (outcome.kind !== "graded") throw new Error("unreachable");
  return outcome.attempt.grade;
}

function quizResultsBroadcast(broadcaster: FakeBeatBroadcaster) {
  const results = [];
  for (const message of broadcaster.sentMessages) {
    if (message.type === "quiz_result") {
      results.push(message.result);
    }
  }
  return results;
}

describe("QuizGradingService grading a multiple choice answer", () => {
  it("grades exactly the right choices as correct", async () => {
    const { gradingService } = await harnessWithMultipleChoiceQuestion();

    assert.equal(await gradeChoices(gradingService, ["a", "c"]), "correct");
  });

  it("ignores the order the learner chose them in", async () => {
    const { gradingService } = await harnessWithMultipleChoiceQuestion();

    assert.equal(await gradeChoices(gradingService, ["c", "a"]), "correct");
  });

  it("grades some of the right choices, and nothing wrong, as partly correct", async () => {
    const { gradingService } = await harnessWithMultipleChoiceQuestion();

    assert.equal(await gradeChoices(gradingService, ["a"]), "partly_correct");
  });

  it("grades a wrong choice as incorrect, even alongside a right one", async () => {
    const { gradingService } = await harnessWithMultipleChoiceQuestion();

    assert.equal(await gradeChoices(gradingService, ["a", "b"]), "incorrect");
  });

  it("grades only wrong choices as incorrect", async () => {
    const { gradingService } = await harnessWithMultipleChoiceQuestion();

    assert.equal(await gradeChoices(gradingService, ["b"]), "incorrect");
  });

  it("grades a choice that was never offered as incorrect", async () => {
    const { gradingService } = await harnessWithMultipleChoiceQuestion();

    assert.equal(await gradeChoices(gradingService, ["z"]), "incorrect");
  });

  it("grades it here rather than asking the teaching agent", async () => {
    const { gradingService } = await harnessWithMultipleChoiceQuestion();

    const outcome = await gradingService.gradeAnswer("queue-order-1", {
      format: "multiple_choice",
      selectedChoiceIds: ["a", "c"],
    });

    assert.equal(outcome.kind === "graded" ? outcome.attempt.gradedBy : "", "lesson_server");
  });

  it("stores the attempt so the learner model survives a page reload", async () => {
    const { gradingService, repository } = await harnessWithMultipleChoiceQuestion();

    await gradeChoices(gradingService, ["a"]);

    const attempts = await repository.listQuizAttempts(LESSON_ID);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0]?.grade, "partly_correct");
    assert.deepEqual(attempts[0]?.relatedTerms, ["queue"]);
  });

  it("tells the page the grade and the explanation", async () => {
    const { gradingService, broadcaster } = await harnessWithMultipleChoiceQuestion();

    await gradeChoices(gradingService, ["b"]);

    assert.deepEqual(quizResultsBroadcast(broadcaster), [
      {
        questionId: "queue-order-1",
        grade: "incorrect",
        explanation: "A queue is served in the order things arrived.",
        correctChoiceIds: ["a", "c"],
      },
    ]);
  });

  it("says so when the answer names a question this lesson never asked", async () => {
    const { gradingService } = await harnessWithMultipleChoiceQuestion();

    const outcome = await gradingService.gradeAnswer("never-asked-1", {
      format: "multiple_choice",
      selectedChoiceIds: ["a"],
    });

    assert.equal(outcome.kind, "unknown_question");
  });

  it("refuses an answer format the question did not ask for", async () => {
    const { gradingService } = await harnessWithMultipleChoiceQuestion();

    const outcome = await gradingService.gradeAnswer("queue-order-1", {
      format: "short_text",
      text: "The oldest one.",
    });

    assert.equal(outcome.kind, "wrong_answer_format");
  });
});

describe("QuizGradingService grading a free text answer", () => {
  it("hands the answer to the teaching agent, because only it can read the words", async () => {
    const { gradingService } = await harnessWithFreeTextQuestion();

    const outcome = await gradingService.gradeAnswer("queue-purpose-1", {
      format: "short_text",
      text: "Work can wait instead of being lost.",
    });

    assert.equal(outcome.kind, "needs_agent_grading");
    if (outcome.kind !== "needs_agent_grading") return;
    assert.equal(outcome.question, "Why does a queue help?");
    assert.equal(outcome.correctAnswerCriteria, "Says work can wait instead of being lost.");
    assert.equal(outcome.submittedAnswer, "Work can wait instead of being lost.");
  });

  it("stores nothing until the teaching agent has graded it", async () => {
    const { gradingService, repository } = await harnessWithFreeTextQuestion();

    await gradingService.gradeAnswer("queue-purpose-1", {
      format: "short_text",
      text: "Work can wait.",
    });

    assert.deepEqual(await repository.listQuizAttempts(LESSON_ID), []);
  });

  it("stores the attempt once the teaching agent has graded it", async () => {
    const { gradingService, repository } = await harnessWithFreeTextQuestion();
    await gradingService.gradeAnswer("queue-purpose-1", {
      format: "short_text",
      text: "Work can wait.",
    });

    const outcome = await gradingService.recordAgentGrade({
      questionId: "queue-purpose-1",
      grade: "partly_correct",
      explanation: "You have half of it: say what would happen without the queue.",
    });

    assert.equal(outcome.kind, "graded");
    const attempts = await repository.listQuizAttempts(LESSON_ID);
    assert.equal(attempts[0]?.grade, "partly_correct");
    assert.equal(attempts[0]?.gradedBy, "teaching_agent");
    assert.equal(attempts[0]?.submittedAnswer, "Work can wait.");
  });

  it("tells the page the grade the teaching agent gave", async () => {
    const { gradingService, broadcaster } = await harnessWithFreeTextQuestion();
    await gradingService.gradeAnswer("queue-purpose-1", {
      format: "short_text",
      text: "Work can wait.",
    });

    await gradingService.recordAgentGrade({
      questionId: "queue-purpose-1",
      grade: "correct",
      explanation: "That is it.",
    });

    assert.deepEqual(quizResultsBroadcast(broadcaster), [
      {
        questionId: "queue-purpose-1",
        grade: "correct",
        explanation: "That is it.",
        correctChoiceIds: [],
      },
    ]);
  });

  it("says so when the teaching agent grades an answer nobody submitted", async () => {
    const { gradingService } = await harnessWithFreeTextQuestion();

    const outcome = await gradingService.recordAgentGrade({
      questionId: "queue-purpose-1",
      grade: "correct",
      explanation: "That is it.",
    });

    assert.equal(outcome.kind, "no_answer_waiting");
  });

  it("grades an answer once, so a second grade for the same answer is refused", async () => {
    const { gradingService } = await harnessWithFreeTextQuestion();
    await gradingService.gradeAnswer("queue-purpose-1", {
      format: "short_text",
      text: "Work can wait.",
    });
    await gradingService.recordAgentGrade({
      questionId: "queue-purpose-1",
      grade: "correct",
      explanation: "That is it.",
    });

    const outcome = await gradingService.recordAgentGrade({
      questionId: "queue-purpose-1",
      grade: "incorrect",
      explanation: "Changed my mind.",
    });

    assert.equal(outcome.kind, "no_answer_waiting");
  });
});

describe("QuizGradingService keeping what the learner was shown", () => {
  it("stores the explanation shown for a question it graded itself", async () => {
    const { gradingService, repository } = await harnessWithMultipleChoiceQuestion();

    await gradeChoices(gradingService, ["a", "c"]);

    assert.equal(
      (await repository.listQuizAttempts(LESSON_ID))[0]?.explanation,
      "A queue is served in the order things arrived.",
    );
  });

  it("stores the explanation the teaching agent wrote, which is nowhere else", async () => {
    const { gradingService, repository } = await harnessWithFreeTextQuestion();
    await gradingService.gradeAnswer("queue-purpose-1", {
      format: "short_text",
      text: "So work can wait.",
    });

    await gradingService.recordAgentGrade({
      questionId: "queue-purpose-1",
      grade: "correct",
      explanation: "You said the important part: the work waits.",
    });

    assert.equal(
      (await repository.listQuizAttempts(LESSON_ID))[0]?.explanation,
      "You said the important part: the work waits.",
    );
  });
});
