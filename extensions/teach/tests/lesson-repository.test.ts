import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import type { ConceptCardBeat } from "../shared/beat.ts";
import type { LearnerSignal, PauseDwell, QuizAttempt } from "../shared/learner-history.ts";
import type { LessonMetadata } from "../shared/lesson.ts";
import { InvalidLessonError } from "../shared/lesson.ts";
import { LessonRepository } from "../src/services/lesson-repository.ts";

async function emptyLessonsDirectory(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "teach-lessons-"));
}

function lessonMetadata(overrides: Partial<LessonMetadata> = {}): LessonMetadata {
  return {
    lessonId: "lesson-abc123",
    topic: "How a message queue works",
    status: "teaching",
    createdAt: "2024-05-01T10:00:00.000Z",
    updatedAt: "2024-05-01T10:00:00.000Z",
    references: [{ kind: "url", label: "Docs", value: "https://example.com/queues" }],
    beatCount: 0,
    ...overrides,
  };
}

function conceptCardBeat(sequenceNumber: number): ConceptCardBeat {
  return {
    kind: "concept_card",
    beatId: `beat-${sequenceNumber}`,
    lessonId: "lesson-abc123",
    sequenceNumber,
    createdAt: "2024-05-01T10:00:00.000Z",
    title: `Idea ${sequenceNumber}`,
    plainLanguageSummary: "One idea, said plainly.",
    keyPoints: ["First point."],
    narrationScript: "One idea, said plainly.",
    pauseForLearner: false,
  };
}

function quizAttempt(attemptId: string, overrides: Partial<QuizAttempt> = {}): QuizAttempt {
  return {
    attemptId,
    lessonId: "lesson-abc123",
    beatId: "beat-5",
    questionId: "queue-order-1",
    answerFormat: "multiple_choice",
    submittedAnswer: "The oldest item.",
    selectedChoiceIds: ["a"],
    grade: "correct",
    gradedBy: "lesson_server",
    explanation: "A queue keeps the order work arrived in.",
    relatedTerms: [],
    answeredAt: "2024-05-01T10:05:00.000Z",
    ...overrides,
  };
}

function pauseDwell(actualWaitSeconds: number): PauseDwell {
  return {
    lessonId: "lesson-abc123",
    beatId: "beat-7",
    suggestedWaitSeconds: 20,
    actualWaitSeconds,
    resumedAt: "2024-05-01T10:06:00.000Z",
  };
}

describe("LessonRepository lesson records", () => {
  it("reads back a lesson it saved", async () => {
    const repository = new LessonRepository(await emptyLessonsDirectory());
    const metadata = lessonMetadata();

    await repository.saveLesson(metadata);

    assert.deepEqual(await repository.getLesson(metadata.lessonId), metadata);
  });

  it("returns nothing for a lesson that was never saved", async () => {
    const repository = new LessonRepository(await emptyLessonsDirectory());

    assert.equal(await repository.getLesson("lesson-missing"), null);
  });

  it("replaces the record when the same lesson is saved again", async () => {
    const repository = new LessonRepository(await emptyLessonsDirectory());
    await repository.saveLesson(lessonMetadata({ status: "teaching" }));

    await repository.saveLesson(lessonMetadata({ status: "finished", beatCount: 4 }));

    const stored = await repository.getLesson("lesson-abc123");
    assert.equal(stored?.status, "finished");
    assert.equal(stored?.beatCount, 4);
  });

  it("leaves no partly written file behind when saves overlap", async () => {
    const lessonsDirectory = await emptyLessonsDirectory();
    const repository = new LessonRepository(lessonsDirectory);

    await Promise.all(
      Array.from({ length: 25 }, (_unused, index) =>
        repository.saveLesson(lessonMetadata({ beatCount: index })),
      ),
    );

    assert.ok(await repository.getLesson("lesson-abc123"));
    const filesInLessonDirectory = await readdir(path.join(lessonsDirectory, "lesson-abc123"));
    assert.deepEqual(
      filesInLessonDirectory.filter((fileName) => fileName.endsWith(".tmp")),
      [],
    );
  });

  it("lists every saved lesson", async () => {
    const repository = new LessonRepository(await emptyLessonsDirectory());
    await repository.saveLesson(lessonMetadata({ lessonId: "lesson-one" }));
    await repository.saveLesson(lessonMetadata({ lessonId: "lesson-two" }));

    const lessons = await repository.listLessons();

    assert.deepEqual(
      lessons.map((lesson) => lesson.lessonId).sort(),
      ["lesson-one", "lesson-two"],
    );
  });

  it("refuses a lesson id that would climb out of the lessons directory", async () => {
    const repository = new LessonRepository(await emptyLessonsDirectory());

    await assert.rejects(
      () => repository.getLesson("../../../etc/passwd"),
      InvalidLessonError,
    );
  });

  it("names the lesson file when it holds something that is not JSON", async () => {
    const lessonsDirectory = await emptyLessonsDirectory();
    const repository = new LessonRepository(lessonsDirectory);
    await repository.saveLesson(lessonMetadata());
    await writeFile(path.join(lessonsDirectory, "lesson-abc123", "lesson.json"), "{ not json");

    await assert.rejects(() => repository.getLesson("lesson-abc123"), (cause: unknown) => {
      assert.ok(cause instanceof InvalidLessonError);
      assert.match(cause.message, /lesson-abc123/);
      return true;
    });
  });

  it("skips a corrupt lesson when it lists lessons", async () => {
    const lessonsDirectory = await emptyLessonsDirectory();
    const repository = new LessonRepository(lessonsDirectory);
    await repository.saveLesson(lessonMetadata({ lessonId: "lesson-good" }));
    await repository.saveLesson(lessonMetadata({ lessonId: "lesson-bad" }));
    await writeFile(path.join(lessonsDirectory, "lesson-bad", "lesson.json"), "{ not json");

    const lessons = await repository.listLessons();

    assert.deepEqual(
      lessons.map((lesson) => lesson.lessonId),
      ["lesson-good"],
    );
  });
});

describe("LessonRepository metadata updates", () => {
  it("changes one field and leaves the rest alone", async () => {
    const repository = new LessonRepository(await emptyLessonsDirectory());
    await repository.saveLesson(lessonMetadata({ status: "setup", beatCount: 0 }));

    await repository.updateLesson("lesson-abc123", (metadata) => ({
      ...metadata,
      status: "teaching",
    }));

    const stored = await repository.getLesson("lesson-abc123");
    assert.equal(stored?.status, "teaching");
    assert.equal(stored?.topic, "How a message queue works");
  });

  it("reports nothing to change for a lesson that was never saved", async () => {
    const repository = new LessonRepository(await emptyLessonsDirectory());

    assert.equal(
      await repository.updateLesson("lesson-missing", (metadata) => metadata),
      null,
    );
  });

  it("keeps every overlapping change, because status and beat count are written by different callers", async () => {
    const repository = new LessonRepository(await emptyLessonsDirectory());
    await repository.saveLesson(lessonMetadata({ status: "setup", beatCount: 0 }));

    await Promise.all([
      repository.updateLesson("lesson-abc123", (metadata) => ({
        ...metadata,
        status: "teaching",
      })),
      ...Array.from({ length: 20 }, () =>
        repository.updateLesson("lesson-abc123", (metadata) => ({
          ...metadata,
          beatCount: metadata.beatCount + 1,
        })),
      ),
    ]);

    const stored = await repository.getLesson("lesson-abc123");
    assert.equal(stored?.status, "teaching");
    assert.equal(stored?.beatCount, 20);
  });

  it("does not let a failed change stop the next one", async () => {
    const repository = new LessonRepository(await emptyLessonsDirectory());
    await repository.saveLesson(lessonMetadata({ beatCount: 0 }));

    await assert.rejects(() =>
      repository.updateLesson("lesson-abc123", () => {
        throw new Error("the change itself failed");
      }),
    );
    await repository.updateLesson("lesson-abc123", (metadata) => ({
      ...metadata,
      beatCount: 7,
    }));

    assert.equal((await repository.getLesson("lesson-abc123"))?.beatCount, 7);
  });
});

describe("LessonRepository beat log", () => {
  it("reads back the beats in the order they were appended", async () => {
    const repository = new LessonRepository(await emptyLessonsDirectory());
    await repository.saveLesson(lessonMetadata());

    await repository.appendBeat("lesson-abc123", conceptCardBeat(1));
    await repository.appendBeat("lesson-abc123", conceptCardBeat(2));

    const beats = await repository.listBeats("lesson-abc123");
    assert.deepEqual(
      beats.map((beat) => beat.sequenceNumber),
      [1, 2],
    );
  });

  it("only adds to the log and never rewrites an earlier beat", async () => {
    const lessonsDirectory = await emptyLessonsDirectory();
    const repository = new LessonRepository(lessonsDirectory);
    await repository.saveLesson(lessonMetadata());
    await repository.appendBeat("lesson-abc123", conceptCardBeat(1));
    const logPath = path.join(lessonsDirectory, "lesson-abc123", "beats.jsonl");
    const firstLine = (await readFile(logPath, "utf8")).split("\n")[0];

    await repository.appendBeat("lesson-abc123", conceptCardBeat(2));

    const lines = (await readFile(logPath, "utf8")).trimEnd().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(lines[0], firstLine);
  });

  it("stores one beat per line so the log can be streamed", async () => {
    const lessonsDirectory = await emptyLessonsDirectory();
    const repository = new LessonRepository(lessonsDirectory);
    await repository.saveLesson(lessonMetadata());

    await repository.appendBeat("lesson-abc123", conceptCardBeat(1));

    const logContent = await readFile(
      path.join(lessonsDirectory, "lesson-abc123", "beats.jsonl"),
      "utf8",
    );
    assert.equal(logContent.endsWith("\n"), true);
    assert.equal(logContent.trimEnd().includes("\n"), false);
  });

  it("returns no beats for a lesson with no log yet", async () => {
    const repository = new LessonRepository(await emptyLessonsDirectory());

    assert.deepEqual(await repository.listBeats("lesson-abc123"), []);
  });

  it("reports the line number when the log holds something that is not a beat", async () => {
    const lessonsDirectory = await emptyLessonsDirectory();
    const repository = new LessonRepository(lessonsDirectory);
    await repository.saveLesson(lessonMetadata());
    await repository.appendBeat("lesson-abc123", conceptCardBeat(1));
    const logPath = path.join(lessonsDirectory, "lesson-abc123", "beats.jsonl");
    await writeFile(logPath, `${await readFile(logPath, "utf8")}{"kind":"concept_card"}\n`);

    await assert.rejects(() => repository.listBeats("lesson-abc123"), /line 2/);
  });
});

describe("LessonRepository quiz attempt log", () => {
  it("reads back the attempts it appended, oldest first", async () => {
    const repository = new LessonRepository(await emptyLessonsDirectory());
    await repository.saveLesson(lessonMetadata());

    await repository.appendQuizAttempt("lesson-abc123", quizAttempt("attempt-1"));
    await repository.appendQuizAttempt("lesson-abc123", quizAttempt("attempt-2"));

    const attempts = await repository.listQuizAttempts("lesson-abc123");
    assert.deepEqual(
      attempts.map((attempt) => attempt.attemptId),
      ["attempt-1", "attempt-2"],
    );
  });

  it("keeps the grade, so the learner model can be worked out again after a restart", async () => {
    const repository = new LessonRepository(await emptyLessonsDirectory());
    await repository.saveLesson(lessonMetadata());

    await repository.appendQuizAttempt(
      "lesson-abc123",
      quizAttempt("attempt-1", { grade: "incorrect", relatedTerms: ["queue"] }),
    );

    const attempts = await repository.listQuizAttempts("lesson-abc123");
    assert.equal(attempts[0]?.grade, "incorrect");
    assert.deepEqual(attempts[0]?.relatedTerms, ["queue"]);
  });

  it("returns no attempts for a lesson nobody has answered anything in", async () => {
    const repository = new LessonRepository(await emptyLessonsDirectory());

    assert.deepEqual(await repository.listQuizAttempts("lesson-abc123"), []);
  });

  it("reports the line number when the log holds something that is not an attempt", async () => {
    const lessonsDirectory = await emptyLessonsDirectory();
    const repository = new LessonRepository(lessonsDirectory);
    await repository.saveLesson(lessonMetadata());
    await repository.appendQuizAttempt("lesson-abc123", quizAttempt("attempt-1"));
    const logPath = path.join(lessonsDirectory, "lesson-abc123", "quiz-attempts.jsonl");
    await writeFile(logPath, `${await readFile(logPath, "utf8")}{"attemptId":"attempt-2"}\n`);

    await assert.rejects(() => repository.listQuizAttempts("lesson-abc123"), /line 2/);
  });
});

describe("LessonRepository pause dwell log", () => {
  it("reads back the dwells it appended", async () => {
    const repository = new LessonRepository(await emptyLessonsDirectory());
    await repository.saveLesson(lessonMetadata());

    await repository.appendPauseDwell("lesson-abc123", pauseDwell(45));

    const dwells = await repository.listPauseDwells("lesson-abc123");
    assert.equal(dwells.length, 1);
    assert.equal(dwells[0]?.actualWaitSeconds, 45);
  });

  it("returns no dwells for a lesson that has never paused", async () => {
    const repository = new LessonRepository(await emptyLessonsDirectory());

    assert.deepEqual(await repository.listPauseDwells("lesson-abc123"), []);
  });
});

describe("LessonRepository learner signal log", () => {
  it("reads back what the learner asked for, oldest first", async () => {
    const repository = new LessonRepository(await emptyLessonsDirectory());
    await repository.saveLesson(lessonMetadata());

    await repository.appendLearnerSignal("lesson-abc123", learnerSignal("simpler"));
    await repository.appendLearnerSignal("lesson-abc123", learnerSignal("go_deeper"));

    const signals = await repository.listLearnerSignals("lesson-abc123");
    assert.deepEqual(
      signals.map((signal) => signal.signal),
      ["simpler", "go_deeper"],
    );
  });

  it("returns nothing for a learner who has asked for nothing", async () => {
    const repository = new LessonRepository(await emptyLessonsDirectory());

    assert.deepEqual(await repository.listLearnerSignals("lesson-abc123"), []);
  });

  it("keeps the learner's requests apart from the lesson's other records", async () => {
    const directory = await emptyLessonsDirectory();
    const repository = new LessonRepository(directory);
    await repository.saveLesson(lessonMetadata());

    await repository.appendLearnerSignal("lesson-abc123", learnerSignal("simpler"));

    const files = await readdir(path.join(directory, "lesson-abc123"));
    assert.ok(files.includes("learner-signals.jsonl"), files.join(", "));
    assert.deepEqual(await repository.listPauseDwells("lesson-abc123"), []);
  });

  it("refuses a log line that is not a learner signal, rather than teaching from it", async () => {
    const directory = await emptyLessonsDirectory();
    const repository = new LessonRepository(directory);
    await repository.saveLesson(lessonMetadata());
    await repository.appendLearnerSignal("lesson-abc123", learnerSignal("simpler"));
    await writeFile(
      path.join(directory, "lesson-abc123", "learner-signals.jsonl"),
      '{"lessonId":"lesson-abc123","signal":"bored","askedAt":"2024-05-01T10:01:00.000Z"}\n',
      "utf8",
    );

    await assert.rejects(
      () => repository.listLearnerSignals("lesson-abc123"),
      InvalidLessonError,
    );
  });
});

function learnerSignal(signal: LearnerSignal["signal"]): LearnerSignal {
  return { lessonId: "lesson-abc123", signal, askedAt: "2024-05-01T10:01:00.000Z" };
}
