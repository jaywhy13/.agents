import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { InvalidBeatError } from "../shared/beat.ts";
import type { LessonMetadata } from "../shared/lesson.ts";
import {
  BeatPublisher,
  LessonAlreadyPausedError,
} from "../src/services/beat-publisher.ts";
import { LessonRepository } from "../src/services/lesson-repository.ts";
import {
  asCode,
  asConceptCard,
  asDefinition,
  asLessonEnd,
  asNarration,
  asPause,
  asQuiz,
} from "./support/beat-narrowing.ts";
import { FakeBeatBroadcaster } from "./support/fake-beat-broadcaster.ts";

const LESSON_ID = "lesson-abc123";

function lessonMetadata(overrides: Partial<LessonMetadata> = {}): LessonMetadata {
  return {
    lessonId: LESSON_ID,
    topic: "How a message queue works",
    status: "teaching",
    createdAt: "2024-05-01T10:00:00.000Z",
    updatedAt: "2024-05-01T10:00:00.000Z",
    references: [],
    beatCount: 0,
    ...overrides,
  };
}

function conceptCardRequest(overrides: Record<string, unknown> = {}) {
  return {
    title: "What a queue is",
    plainLanguageSummary: "A queue holds work until a worker is free.",
    keyPoints: ["Work waits in line."],
    narrationScript: "A queue holds work until a worker is free.",
    pauseForLearner: true,
    ...overrides,
  } as Parameters<BeatPublisher["publishConceptCard"]>[0];
}

async function publisherForNewLesson(
  overrides: Partial<LessonMetadata> = {},
): Promise<{
  publisher: BeatPublisher;
  repository: LessonRepository;
  broadcaster: FakeBeatBroadcaster;
}> {
  const repository = new LessonRepository(await mkdtemp(path.join(tmpdir(), "teach-publish-")));
  const metadata = lessonMetadata(overrides);
  await repository.saveLesson(metadata);
  const broadcaster = new FakeBeatBroadcaster();
  let nextBeatNumber = 0;
  const publisher = new BeatPublisher({
    lessonId: metadata.lessonId,
    lessonRepository: repository,
    beatBroadcaster: broadcaster,
    now: () => new Date("2024-05-01T11:00:00.000Z"),
    createBeatId: () => {
      nextBeatNumber += 1;
      return `beat-${nextBeatNumber}`;
    },
    startingBeatCount: metadata.beatCount,
  });
  return { publisher, repository, broadcaster };
}

describe("BeatPublisher", () => {
  it("numbers the first beat of a lesson one", async () => {
    const { publisher } = await publisherForNewLesson();

    const beat = await publisher.publishConceptCard(conceptCardRequest());

    assert.equal(beat.sequenceNumber, 1);
  });

  it("numbers each later beat one higher", async () => {
    const { publisher } = await publisherForNewLesson();
    await publisher.publishConceptCard(conceptCardRequest());

    const secondBeat = await publisher.publishConceptCard(conceptCardRequest());

    assert.equal(secondBeat.sequenceNumber, 2);
  });

  it("continues numbering after a lesson that already has beats", async () => {
    const { publisher } = await publisherForNewLesson({ beatCount: 7 });

    const beat = await publisher.publishConceptCard(conceptCardRequest());

    assert.equal(beat.sequenceNumber, 8);
  });

  it("writes the beat to the lesson log", async () => {
    const { publisher, repository } = await publisherForNewLesson();

    await publisher.publishConceptCard(conceptCardRequest({ title: "Backpressure" }));

    const beats = await repository.listBeats(LESSON_ID);
    assert.equal(beats.length, 1);
    assert.equal(asConceptCard(beats[0]).title, "Backpressure");
  });

  it("sends the beat to the connected browser", async () => {
    const { publisher, broadcaster } = await publisherForNewLesson();

    await publisher.publishConceptCard(conceptCardRequest({ title: "Backpressure" }));

    assert.deepEqual(
      broadcaster.broadcastBeats.map((beat) => asConceptCard(beat).title),
      ["Backpressure"],
    );
  });

  it("keeps the lesson beat count in step with the log", async () => {
    const { publisher, repository } = await publisherForNewLesson();

    await publisher.publishConceptCard(conceptCardRequest());
    await publisher.publishConceptCard(conceptCardRequest());

    assert.equal((await repository.getLesson(LESSON_ID))?.beatCount, 2);
  });

  it("records when the lesson was last changed", async () => {
    const { publisher, repository } = await publisherForNewLesson();

    await publisher.publishConceptCard(conceptCardRequest());

    assert.equal((await repository.getLesson(LESSON_ID))?.updatedAt, "2024-05-01T11:00:00.000Z");
  });

  it("refuses a concept card with no title", async () => {
    const { publisher } = await publisherForNewLesson();

    await assert.rejects(
      () => publisher.publishConceptCard(conceptCardRequest({ title: "" })),
      InvalidBeatError,
    );
  });

  it("does not write a refused concept card to the log", async () => {
    const { publisher, repository } = await publisherForNewLesson();

    await assert.rejects(() => publisher.publishConceptCard(conceptCardRequest({ keyPoints: [] })));

    assert.deepEqual(await repository.listBeats(LESSON_ID), []);
  });
});

function definitionRequest(overrides: Record<string, unknown> = {}) {
  return {
    term: "queue",
    fullForm: null,
    plainLanguageMeaning: "A line of work waiting for a worker.",
    example: null,
    narration: [],
    ...overrides,
  } as Parameters<BeatPublisher["publishDefinition"]>[0];
}

function codeRequest(overrides: Record<string, unknown> = {}) {
  return {
    language: "javascript",
    fileName: "queue.js",
    code: "queue.append(job);\nreturn job.id;",
    explanation: "This adds one job to the end of the queue.",
    emphasizedLineRanges: [{ startLine: 1, endLine: 1 }],
    narration: [],
    ...overrides,
  } as Parameters<BeatPublisher["publishCode"]>[0];
}

function multipleChoiceQuizRequest(overrides: Record<string, unknown> = {}) {
  return {
    answerFormat: "multiple_choice",
    questionId: "queue-order-1",
    question: "Which item does a worker take first?",
    choices: [
      { choiceId: "a", text: "The oldest item." },
      { choiceId: "b", text: "The newest item." },
    ],
    correctChoiceIds: ["a"],
    explanation: "A queue is served in the order things arrived.",
    relatedTerms: ["queue"],
    narration: [],
    ...overrides,
  } as Parameters<BeatPublisher["publishQuiz"]>[0];
}

function pauseRequest(overrides: Record<string, unknown> = {}) {
  return {
    reason: "Read those two lines again.",
    suggestedWaitSeconds: 20,
    narration: [],
    ...overrides,
  } as Parameters<BeatPublisher["publishPause"]>[0];
}

function lessonEndRequest(overrides: Record<string, unknown> = {}) {
  return {
    recap: "A queue holds work so nothing is lost.",
    masteredConcepts: ["queue"],
    suggestedNextTopics: ["Dead letter queues"],
    narration: [],
    ...overrides,
  } as Parameters<BeatPublisher["publishLessonEnd"]>[0];
}

describe("BeatPublisher definition beats", () => {
  it("stores the definition so it can be replayed into the glossary", async () => {
    const { publisher, repository } = await publisherForNewLesson();

    await publisher.publishDefinition(definitionRequest({ term: "backpressure" }));

    assert.equal(asDefinition((await repository.listBeats(LESSON_ID))[0]).term, "backpressure");
  });

  it("sends the definition to the connected browser", async () => {
    const { publisher, broadcaster } = await publisherForNewLesson();

    await publisher.publishDefinition(definitionRequest({ term: "backpressure" }));

    assert.equal(asDefinition(broadcaster.broadcastBeats[0]).term, "backpressure");
  });

  it("refuses a definition with no meaning, and writes nothing", async () => {
    const { publisher, repository } = await publisherForNewLesson();

    await assert.rejects(
      () => publisher.publishDefinition(definitionRequest({ plainLanguageMeaning: "" })),
      InvalidBeatError,
    );
    assert.deepEqual(await repository.listBeats(LESSON_ID), []);
  });
});

describe("BeatPublisher narration", () => {
  it("publishes narration tied to the beat it speaks", async () => {
    const { publisher, repository } = await publisherForNewLesson();

    const definition = await publisher.publishDefinition(
      definitionRequest({
        narration: [{ kind: "sentence", text: "A queue is a line of waiting work." }],
      }),
    );

    const narration = asNarration((await repository.listBeats(LESSON_ID))[1]);
    assert.equal(narration.relatedBeatId, definition.beatId);
    assert.deepEqual(narration.chunks, [
      { kind: "sentence", text: "A queue is a line of waiting work." },
    ]);
  });

  it("numbers the narration after the beat it speaks", async () => {
    const { publisher } = await publisherForNewLesson();

    const definition = await publisher.publishDefinition(
      definitionRequest({ narration: [{ kind: "sentence", text: "A line of waiting work." }] }),
    );

    assert.equal(definition.sequenceNumber, 1);
    assert.equal((await publisher.publishDefinition(definitionRequest())).sequenceNumber, 3);
  });

  it("publishes no narration beat when the lesson supplied no narration", async () => {
    const { publisher, repository } = await publisherForNewLesson();

    await publisher.publishDefinition(definitionRequest());

    assert.equal((await repository.listBeats(LESSON_ID)).length, 1);
  });
});

describe("BeatPublisher code beats", () => {
  it("stores the code, the file name and the lines to look at", async () => {
    const { publisher, repository } = await publisherForNewLesson();

    await publisher.publishCode(codeRequest());

    const beat = asCode((await repository.listBeats(LESSON_ID))[0]);
    assert.equal(beat.fileName, "queue.js");
    assert.deepEqual(beat.emphasizedLineRanges, [{ startLine: 1, endLine: 1 }]);
  });

  it("refuses an emphasis range past the end of the code", async () => {
    const { publisher } = await publisherForNewLesson();

    await assert.rejects(
      () =>
        publisher.publishCode(codeRequest({ emphasizedLineRanges: [{ startLine: 1, endLine: 40 }] })),
      InvalidBeatError,
    );
  });
});

describe("BeatPublisher quiz beats", () => {
  it("stores a multiple choice question with its correct answers", async () => {
    const { publisher, repository } = await publisherForNewLesson();

    await publisher.publishQuiz(multipleChoiceQuizRequest());

    const beat = asQuiz((await repository.listBeats(LESSON_ID))[0]);
    assert.equal(beat.answerFormat, "multiple_choice");
    if (beat.answerFormat !== "multiple_choice") return;
    assert.deepEqual(beat.correctChoiceIds, ["a"]);
  });

  it("stores a free text question with the criteria it will be graded against", async () => {
    const { publisher, repository } = await publisherForNewLesson();

    await publisher.publishQuiz(
      multipleChoiceQuizRequest({
        answerFormat: "short_text",
        choices: undefined,
        correctChoiceIds: undefined,
        correctAnswerCriteria: "Says the oldest item goes first.",
      }),
    );

    const beat = asQuiz((await repository.listBeats(LESSON_ID))[0]);
    assert.equal(beat.answerFormat, "short_text");
    if (beat.answerFormat !== "short_text") return;
    assert.equal(beat.correctAnswerCriteria, "Says the oldest item goes first.");
  });
});

describe("BeatPublisher pause beats", () => {
  it("stores the reason and the suggested wait", async () => {
    const { publisher, repository } = await publisherForNewLesson();

    await publisher.publishPause(pauseRequest());

    const beat = asPause((await repository.listBeats(LESSON_ID))[0]);
    assert.equal(beat.reason, "Read those two lines again.");
    assert.equal(beat.suggestedWaitSeconds, 20);
  });

  it("reports that this turn has paused, so the turn can be ended", async () => {
    const { publisher } = await publisherForNewLesson();

    await publisher.publishPause(pauseRequest());

    assert.equal(publisher.hasPausedThisTurn, true);
  });

  it("refuses a further teaching beat after a pause in the same turn", async () => {
    const { publisher } = await publisherForNewLesson();
    await publisher.publishPause(pauseRequest());

    await assert.rejects(
      () => publisher.publishDefinition(definitionRequest()),
      LessonAlreadyPausedError,
    );
  });

  it("writes nothing for a beat refused after a pause", async () => {
    const { publisher, repository } = await publisherForNewLesson();
    await publisher.publishPause(pauseRequest());

    await assert.rejects(() => publisher.publishDefinition(definitionRequest()));

    assert.equal((await repository.listBeats(LESSON_ID)).length, 1);
  });

  it("refuses a second pause in the same turn", async () => {
    const { publisher } = await publisherForNewLesson();
    await publisher.publishPause(pauseRequest());

    await assert.rejects(() => publisher.publishPause(pauseRequest()), LessonAlreadyPausedError);
  });

  it("allows teaching again once a new turn has begun", async () => {
    const { publisher } = await publisherForNewLesson();
    await publisher.publishPause(pauseRequest());

    publisher.beginTurn();

    assert.equal(publisher.hasPausedThisTurn, false);
    assert.equal((await publisher.publishDefinition(definitionRequest())).kind, "definition");
  });

  it("still lets the paused beat be narrated, because narration is not a new idea", async () => {
    const { publisher, repository } = await publisherForNewLesson();

    await publisher.publishPause(
      pauseRequest({ narration: [{ kind: "sentence", text: "Take a moment." }] }),
    );

    assert.equal(asNarration((await repository.listBeats(LESSON_ID))[1]).chunks.length, 1);
  });
});

describe("BeatPublisher lesson end beats", () => {
  it("stores the recap, what was mastered, and what to learn next", async () => {
    const { publisher, repository } = await publisherForNewLesson();

    await publisher.publishLessonEnd(lessonEndRequest());

    const beat = asLessonEnd((await repository.listBeats(LESSON_ID))[0]);
    assert.equal(beat.recap, "A queue holds work so nothing is lost.");
    assert.deepEqual(beat.masteredConcepts, ["queue"]);
    assert.deepEqual(beat.suggestedNextTopics, ["Dead letter queues"]);
  });
});
