import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import type { LessonSetup } from "../shared/lesson.ts";
import type { ConceptCardRequest, PauseRequest } from "../src/services/beat-publisher.ts";
import { LessonAlreadyPausedError } from "../src/services/beat-publisher.ts";
import { LessonRepository } from "../src/services/lesson-repository.ts";
import {
  LessonAlreadyRunningError,
  TeachingLessonConductor,
} from "../src/services/teaching-lesson-conductor.ts";
import { asConceptCard, asDiagram, asImage } from "./support/beat-narrowing.ts";
import { FakeBeatBroadcaster } from "./support/fake-beat-broadcaster.ts";
import { FakeIllustrationDrawer, illustrationIdOf } from "./support/fake-illustration-drawer.ts";
import { FakeReferenceServices } from "./support/fake-reference-services.ts";
import { graphDiagramSpecInput } from "./visuals/support/graph-diagram-factory.ts";
import {
  FakeTeachingAgentSession,
  FakeTeachingAgentSessionFactory,
} from "./support/fake-teaching-agent-session.ts";

const LESSON_ID = "lesson-abc123";

interface Harness {
  readonly conductor: TeachingLessonConductor;
  readonly repository: LessonRepository;
  readonly broadcaster: FakeBeatBroadcaster;
  readonly sessionFactory: FakeTeachingAgentSessionFactory;
  readonly references: FakeReferenceServices;
  readonly drawer: FakeIllustrationDrawer;
  readonly reportedErrors: Error[];
}

/**
 * A teaching turn is started and not awaited, so a rejection that escapes it would
 * take the whole pi process down. These tests watch for that directly.
 */
async function withNoUnhandledRejection<T>(work: () => Promise<T>): Promise<T> {
  const escaped: unknown[] = [];
  const record = (reason: unknown): void => {
    escaped.push(reason);
  };
  process.on("unhandledRejection", record);
  try {
    const result = await work();
    // Unhandled rejections are reported after the microtask queue drains.
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(escaped, [], "a teaching turn rejection escaped the conductor");
    return result;
  } finally {
    process.off("unhandledRejection", record);
  }
}

function lessonSetup(overrides: Partial<LessonSetup> = {}): LessonSetup {
  return { topic: "How a message queue works", references: [], ...overrides };
}

function conceptCardRequest(overrides: Partial<ConceptCardRequest> = {}): ConceptCardRequest {
  return {
    title: "What a queue is",
    plainLanguageSummary: "A queue holds work until a worker is free.",
    keyPoints: ["Work waits in line."],
    narrationScript: "A queue holds work until a worker is free.",
    pauseForLearner: true,
    ...overrides,
  };
}

interface HarnessOptions {
  readonly references?: FakeReferenceServices;
  readonly drawer?: FakeIllustrationDrawer;
  /** Set false to act like a pi session with no Shopify AI Proxy credential. */
  readonly canDrawPictures?: boolean;
}

async function harness(options: HarnessOptions = {}): Promise<Harness> {
  const repository = new LessonRepository(await mkdtemp(path.join(tmpdir(), "teach-conductor-")));
  const broadcaster = new FakeBeatBroadcaster();
  const sessionFactory = new FakeTeachingAgentSessionFactory();
  const references = options.references ?? new FakeReferenceServices();
  const drawer = options.drawer ?? new FakeIllustrationDrawer();
  const reportedErrors: Error[] = [];
  let lessonNumber = 0;
  const conductor = new TeachingLessonConductor({
    lessonRepository: repository,
    beatBroadcaster: broadcaster,
    createTeachingAgentSession: sessionFactory.create,
    references: references.services,
    createIllustrationDrawer:
      options.canDrawPictures === false ? null : (publishState) => drawer.boundTo(publishState),
    now: () => new Date("2024-05-01T10:00:00.000Z"),
    createLessonId: () => (lessonNumber++ === 0 ? LESSON_ID : `${LESSON_ID}-${lessonNumber}`),
    onError: (error) => reportedErrors.push(error),
  });
  return { conductor, repository, broadcaster, sessionFactory, references, drawer, reportedErrors };
}

/** Starts a lesson and hands back the teaching session that is now mid-turn. */
async function harnessTeachingALesson(
  setup: LessonSetup = lessonSetup(),
  options: HarnessOptions = {},
): Promise<Harness & { session: FakeTeachingAgentSession }> {
  const started = await harness(options);
  await started.conductor.startLesson(setup);
  return { ...started, session: started.sessionFactory.onlySession };
}

async function finishTurn(
  conductor: TeachingLessonConductor,
  session: FakeTeachingAgentSession,
): Promise<void> {
  session.finishCurrentPrompt();
  await conductor.waitForIdle();
}

function errorNoticesBroadcast(broadcaster: FakeBeatBroadcaster): string[] {
  const notices: string[] = [];
  for (const message of broadcaster.sentMessages) {
    if (message.type === "notice" && message.level === "error") {
      notices.push(message.text);
    }
  }
  return notices;
}

function statusesBroadcast(broadcaster: FakeBeatBroadcaster): string[] {
  const statuses: string[] = [];
  for (const message of broadcaster.sentMessages) {
    if (message.type === "status") {
      statuses.push(message.status);
    }
  }
  return statuses;
}

describe("TeachingLessonConductor before a lesson starts", () => {
  it("has no lesson to show", async () => {
    const { conductor } = await harness();

    assert.equal(await conductor.getTranscript(), null);
  });
});

describe("TeachingLessonConductor starting a lesson", () => {
  it("saves the topic the learner asked about", async () => {
    const { repository } = await harnessTeachingALesson();

    assert.equal((await repository.getLesson(LESSON_ID))?.topic, "How a message queue works");
  });

  it("saves the references the learner supplied", async () => {
    const { repository } = await harnessTeachingALesson(
      lessonSetup({
        references: [{ kind: "url", label: "Guide", value: "https://example.com/queues" }],
      }),
    );

    assert.deepEqual((await repository.getLesson(LESSON_ID))?.references, [
      { kind: "url", label: "Guide", value: "https://example.com/queues" },
    ]);
  });

  it("gives the teaching session a system prompt that names the topic", async () => {
    const { sessionFactory } = await harnessTeachingALesson();

    assert.match(sessionFactory.systemPrompts[0] ?? "", /How a message queue works/);
  });

  it("starts teaching without waiting for the whole lesson to finish", async () => {
    const { conductor, session } = await harnessTeachingALesson();

    assert.equal(conductor.isTeaching, true);
    assert.equal(session.prompts.length, 1);
  });

  it("tells the page the lesson is being taught, then that it finished", async () => {
    const { conductor, broadcaster, session } = await harnessTeachingALesson();

    await finishTurn(conductor, session);

    assert.deepEqual(statusesBroadcast(broadcaster), ["teaching", "finished"]);
  });

  it("refuses to start a second lesson while one is being taught", async () => {
    const { conductor } = await harnessTeachingALesson();

    await assert.rejects(() => conductor.startLesson(lessonSetup()), LessonAlreadyRunningError);
  });

  it("starts a new lesson once the lesson before it has finished", async () => {
    const { conductor, session, sessionFactory } = await harnessTeachingALesson();
    await finishTurn(conductor, session);

    await conductor.startLesson(lessonSetup({ topic: "How a cache works" }));

    assert.equal(sessionFactory.createdSessions.length, 2);
    assert.equal((await conductor.getTranscript())?.metadata.topic, "How a cache works");
  });

  it("closes the finished lesson's teaching session when the next lesson starts", async () => {
    const { conductor, session } = await harnessTeachingALesson();
    await finishTurn(conductor, session);

    await conductor.startLesson(lessonSetup({ topic: "How a cache works" }));

    assert.equal(session.disposeCount, 1);
  });

  it("starts a new lesson after cleanup, so /teach can be run again", async () => {
    const { conductor, session, sessionFactory } = await harnessTeachingALesson();
    await finishTurn(conductor, session);
    await conductor.dispose();

    await conductor.startLesson(lessonSetup({ topic: "How a cache works" }));

    assert.equal(sessionFactory.createdSessions.length, 2);
  });
});

describe("TeachingLessonConductor teaching a concept", () => {
  it("stores the concept the teaching session taught", async () => {
    const { repository, session } = await harnessTeachingALesson();

    await session.teachConcept(conceptCardRequest());

    assert.equal((await repository.listBeats(LESSON_ID)).length, 1);
  });

  it("sends the concept to the lesson page", async () => {
    const { broadcaster, session } = await harnessTeachingALesson();

    await session.teachConcept(conceptCardRequest({ title: "Backpressure" }));

    assert.deepEqual(
      broadcaster.broadcastBeats.map((beat) => asConceptCard(beat).title),
      ["Backpressure"],
    );
  });

  it("returns the lesson and its beats to a page that reconnects", async () => {
    const { conductor, session } = await harnessTeachingALesson();
    await session.teachConcept(conceptCardRequest());

    const transcript = await conductor.getTranscript();

    assert.equal(transcript?.metadata.topic, "How a message queue works");
    assert.equal(transcript?.beats.length, 1);
  });
});

describe("TeachingLessonConductor interruption", () => {
  it("stops the teaching session at once", async () => {
    const { conductor, session } = await harnessTeachingALesson();

    await conductor.interrupt();

    assert.equal(session.abortCount, 1);
  });

  it("waits for the stopped turn to unwind before it reports back", async () => {
    const { conductor } = await harnessTeachingALesson();

    await conductor.interrupt();

    assert.equal(conductor.isTeaching, false);
  });

  it("tells the page the lesson was stopped", async () => {
    const { conductor, broadcaster } = await harnessTeachingALesson();

    await conductor.interrupt();

    assert.deepEqual(statusesBroadcast(broadcaster), ["teaching", "aborted"]);
  });

  it("records that the lesson was stopped", async () => {
    const { conductor, repository } = await harnessTeachingALesson();

    await conductor.interrupt();

    assert.equal((await repository.getLesson(LESSON_ID))?.status, "aborted");
  });

  it("does nothing when there is no lesson to stop", async () => {
    const { conductor } = await harness();

    await conductor.interrupt();

    assert.equal(await conductor.getTranscript(), null);
  });
});

describe("TeachingLessonConductor answering the learner", () => {
  it("sends a typed answer to the teaching session", async () => {
    const { conductor, session } = await harnessTeachingALesson();
    await finishTurn(conductor, session);

    await conductor.answerQuestion("question-1", "Because the worker was busy.");

    assert.equal(
      session.prompts.some((prompt) => prompt.includes("Because the worker was busy.")),
      true,
    );
  });

  it("asks the teaching session to carry on", async () => {
    const { conductor, session } = await harnessTeachingALesson();
    await finishTurn(conductor, session);

    await conductor.continueLesson();

    assert.equal(session.prompts.length, 2);
  });

  it("refuses to start another turn while one is still running", async () => {
    const { conductor } = await harnessTeachingALesson();

    await assert.rejects(() => conductor.continueLesson(), LessonAlreadyRunningError);
  });

  it("tells the page it is teaching again when the lesson carries on", async () => {
    const { conductor, broadcaster, session } = await harnessTeachingALesson();
    await finishTurn(conductor, session);

    await conductor.continueLesson();

    assert.deepEqual(statusesBroadcast(broadcaster), ["teaching", "finished", "teaching"]);
  });

  it("tells the page it is teaching again when the learner answers", async () => {
    const { conductor, broadcaster, session } = await harnessTeachingALesson();
    await finishTurn(conductor, session);

    await conductor.answerQuestion("question-1", "Because the worker was busy.");

    assert.deepEqual(statusesBroadcast(broadcaster), ["teaching", "finished", "teaching"]);
  });

  it("records that it is teaching again, so a page that reloads sees it", async () => {
    const { conductor, repository, session } = await harnessTeachingALesson();
    await finishTurn(conductor, session);

    await conductor.continueLesson();
    // Metadata writes for one lesson run in turn, so this one lands after the
    // status write the new turn queued.
    await repository.updateLesson(LESSON_ID, (metadata) => metadata);

    assert.equal((await repository.getLesson(LESSON_ID))?.status, "teaching");
  });

  it("can be stopped again after it carried on, so Stop stays usable", async () => {
    const { conductor, broadcaster, session } = await harnessTeachingALesson();
    await finishTurn(conductor, session);
    await conductor.continueLesson();

    await conductor.interrupt();

    assert.deepEqual(statusesBroadcast(broadcaster), [
      "teaching",
      "finished",
      "teaching",
      "aborted",
    ]);
    assert.equal(session.abortCount, 1);
  });

  it("does nothing when there is no lesson yet", async () => {
    const { conductor, sessionFactory } = await harness();

    await conductor.continueLesson();

    assert.equal(sessionFactory.createdSessions.length, 0);
  });
});

describe("TeachingLessonConductor when a teaching turn fails", () => {
  it("does not let the failure escape and take pi down", async () => {
    await withNoUnhandledRejection(async () => {
      const { conductor, session } = await harnessTeachingALesson();

      session.failCurrentPrompt(new Error("the model went away"));
      await conductor.waitForIdle();
    });
  });

  it("tells the lesson page why the lesson stopped", async () => {
    const { conductor, broadcaster, session } = await harnessTeachingALesson();

    session.failCurrentPrompt(new Error("the model went away"));
    await conductor.waitForIdle();

    assert.deepEqual(errorNoticesBroadcast(broadcaster), [
      "The lesson stopped: the model went away",
    ]);
  });

  it("tells the pi session about the failure too", async () => {
    const { conductor, reportedErrors, session } = await harnessTeachingALesson();

    session.failCurrentPrompt(new Error("the model went away"));
    await conductor.waitForIdle();

    assert.deepEqual(
      reportedErrors.map((error) => error.message),
      ["the model went away"],
    );
  });

  it("lets the learner carry on after a failed turn", async () => {
    const { conductor, session } = await harnessTeachingALesson();
    session.failCurrentPrompt(new Error("the model went away"));
    await conductor.waitForIdle();

    await conductor.continueLesson();

    assert.equal(conductor.isTeaching, true);
  });

  it("does not let a failure while saving the status escape either", async () => {
    await withNoUnhandledRejection(async () => {
      const { conductor, session, repository, broadcaster } = await harnessTeachingALesson();
      repository.updateLesson = async () => {
        throw new Error("the lessons folder is read only");
      };

      session.finishCurrentPrompt();
      await conductor.waitForIdle();

      assert.deepEqual(errorNoticesBroadcast(broadcaster), [
        "The lesson stopped: the lessons folder is read only",
      ]);
    });
  });

  it("does not let a failure while starting the turn hide a failing model", async () => {
    await withNoUnhandledRejection(async () => {
      const { conductor, session, repository } = await harnessTeachingALesson();
      repository.updateLesson = async () => {
        throw new Error("the lessons folder is read only");
      };

      session.failCurrentPrompt(new Error("the model went away"));
      await conductor.waitForIdle();
    });
  });
});

describe("TeachingLessonConductor cleanup", () => {
  it("closes the teaching session", async () => {
    const { conductor, session } = await harnessTeachingALesson();
    await finishTurn(conductor, session);

    await conductor.dispose();

    assert.equal(session.disposeCount, 1);
  });

  it("stops a lesson that is still being taught", async () => {
    const { conductor, session } = await harnessTeachingALesson();

    await conductor.dispose();

    assert.equal(session.abortCount, 1);
  });

  it("tells the page nothing more after cleanup", async () => {
    const { conductor, session } = await harnessTeachingALesson();
    await finishTurn(conductor, session);

    await conductor.dispose();

    assert.equal(await conductor.getTranscript(), null);
  });
});

function pauseRequest(overrides: Partial<PauseRequest> = {}): PauseRequest {
  return {
    reason: "Have a think about where the work waits.",
    suggestedWaitSeconds: 30,
    narration: [],
    ...overrides,
  };
}

describe("TeachingLessonConductor when the lesson pauses", () => {
  it("hands the lesson back to the learner without waiting for them", async () => {
    const { session } = await harnessTeachingALesson();

    const beat = await session.pauseLesson(pauseRequest());

    assert.equal(beat.kind, "pause");
  });

  it("refuses another concept in the same turn, so nothing appears while the learner is away", async () => {
    const { session } = await harnessTeachingALesson();
    await session.pauseLesson(pauseRequest());

    await assert.rejects(
      () => session.teachConcept(conceptCardRequest()),
      LessonAlreadyPausedError,
    );
  });

  it("tells the page the lesson is paused rather than finished", async () => {
    const { conductor, broadcaster, session } = await harnessTeachingALesson();
    await session.pauseLesson(pauseRequest());

    await finishTurn(conductor, session);

    assert.deepEqual(statusesBroadcast(broadcaster), ["teaching", "paused"]);
  });

  it("records that the lesson is paused, so a page that reloads sees it", async () => {
    const { conductor, repository, session } = await harnessTeachingALesson();
    await session.pauseLesson(pauseRequest());

    await finishTurn(conductor, session);

    assert.equal((await repository.getLesson(LESSON_ID))?.status, "paused");
  });

  it("lets the next turn teach again, so one pause does not end the lesson", async () => {
    const { conductor, session } = await harnessTeachingALesson();
    await session.pauseLesson(pauseRequest());
    await finishTurn(conductor, session);

    await conductor.continueLesson();

    assert.equal((await session.teachConcept(conceptCardRequest())).kind, "concept_card");
  });

  it("measures how long the learner stayed, so the lesson can change pace", async () => {
    const { conductor, repository, session } = await harnessTeachingALesson();
    await session.pauseLesson(pauseRequest());
    await finishTurn(conductor, session);

    await conductor.continueLesson();

    assert.equal((await repository.listPauseDwells(LESSON_ID)).length, 1);
  });
});

describe("TeachingLessonConductor showing what the learner answered", () => {
  it("returns the graded answers to a page that reconnects", async () => {
    const { conductor, session } = await harnessTeachingALesson();
    await session.askQuizQuestion({
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
    });
    await finishTurn(conductor, session);

    await conductor.submitQuizAnswer("queue-order-1", {
      format: "multiple_choice",
      selectedChoiceIds: ["a"],
    });

    const transcript = await conductor.getTranscript();
    assert.deepEqual(
      transcript?.quizAttempts.map((attempt) => [attempt.questionId, attempt.grade]),
      [["queue-order-1", "correct"]],
    );
  });
});

/**
 * Resolves once the turn has begun but before its prompt has reached the teaching
 * session, which is the window a stop request can fall into.
 */
async function turnHasBegun(conductor: TeachingLessonConductor): Promise<void> {
  while (!conductor.isTeaching) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe("TeachingLessonConductor stopping a turn that is still starting", () => {
  it("stops the turn once it reaches the teaching session, rather than missing it", async () => {
    const { conductor, repository, sessionFactory } = await harness();
    let letTheBriefingFinish = (): void => {};
    const briefingFinished = new Promise<void>((resolve) => {
      letTheBriefingFinish = resolve;
    });
    repository.listBeats = async () => {
      await briefingFinished;
      return [];
    };

    const starting = conductor.startLesson(lessonSetup());
    await turnHasBegun(conductor);

    const stopping = conductor.interrupt();
    letTheBriefingFinish();
    await starting;
    await stopping;

    assert.equal(sessionFactory.onlySession.abortCount, 1);
    assert.equal(conductor.isTeaching, false);
  });
});

describe("TeachingLessonConductor copying the learner's background", () => {
  function setupWithBackground(): LessonSetup {
    return lessonSetup({
      references: [
        { kind: "url", label: "Queue guide", value: "https://example.com/queues" },
        { kind: "pasted", label: "My notes", value: "Queues decouple producers." },
      ],
    });
  }

  it("copies every reference into the lesson before the first turn", async () => {
    const { references, sessionFactory } = await harnessTeachingALesson(setupWithBackground());

    assert.deepEqual(
      references.copiedLessons.map((copied) => copied.lessonId),
      [LESSON_ID],
    );
    assert.deepEqual(
      references.storedFor(LESSON_ID).map((stored) => stored.label),
      ["Queue guide", "My notes"],
    );
    // Copying finished before the teaching session was even built.
    assert.equal(sessionFactory.createdSessions.length, 1);
  });

  it("copies nothing when the learner supplied no background", async () => {
    const { references } = await harnessTeachingALesson();

    assert.deepEqual(references.copiedLessons, []);
  });

  it("shows a notice for one reference that failed, and teaches anyway", async () => {
    const references = new FakeReferenceServices();
    references.failureReasonsByLabel.set("Queue guide", "That address could not be reached.");

    const { broadcaster, conductor } = await harnessTeachingALesson(setupWithBackground(), {
      references,
    });

    assert.deepEqual(errorNoticesBroadcast(broadcaster), [
      "“Queue guide” could not be copied: That address could not be reached. The lesson carries on without it.",
    ]);
    assert.equal(conductor.isTeaching, true);
    assert.deepEqual(
      references.storedFor(LESSON_ID).map((stored) => stored.label),
      ["My notes"],
    );
  });

  it("teaches without any background when copying breaks entirely", async () => {
    const references = new FakeReferenceServices();
    references.copyAllThrows = new Error("The reference store is unreadable.");

    const { broadcaster, conductor, reportedErrors } = await harnessTeachingALesson(
      setupWithBackground(),
      { references },
    );

    assert.equal(conductor.isTeaching, true);
    assert.match(
      errorNoticesBroadcast(broadcaster)[0] ?? "",
      /None of your background could be copied/,
    );
    assert.deepEqual(
      reportedErrors.map((error) => error.message),
      ["The reference store is unreadable."],
    );
  });

  it("lets the lesson list and read its own references, and no other lesson's", async () => {
    const { session, references } = await harnessTeachingALesson(setupWithBackground());

    const listed = await session.listReferences();
    const excerpt = await session.readReference({
      referenceId: listed[0]?.referenceId ?? "",
      offset: 1,
      limit: 10,
    });

    assert.deepEqual(
      listed.map((stored) => stored.label),
      ["Queue guide", "My notes"],
    );
    assert.equal(excerpt?.lessonId, LESSON_ID);
    assert.deepEqual(
      references.excerptReads.map((read) => read.lessonId),
      [LESSON_ID],
    );
  });

  it("treats a reference the lesson does not have as nothing to read, not a failure", async () => {
    const { session } = await harnessTeachingALesson(setupWithBackground());

    assert.equal(
      await session.readReference({ referenceId: "reference-99", offset: 1, limit: 10 }),
      null,
    );
  });
});

describe("TeachingLessonConductor drawing a diagram", () => {
  it("publishes the diagram the lesson described", async () => {
    const { session, broadcaster } = await harnessTeachingALesson();

    await session.drawDiagram({ spec: graphDiagramSpecInput(), narration: [] });

    assert.equal(
      asDiagram(broadcaster.broadcastBeats[0]).spec.title,
      "How a message queue moves work",
    );
  });

  it("refuses a diagram whose edge names a part that is not there", async () => {
    const { session, broadcaster } = await harnessTeachingALesson();

    await assert.rejects(() =>
      session.drawDiagram({
        spec: graphDiagramSpecInput({
          edges: [{ edgeId: "put", fromNodeId: "producer", toNodeId: "nowhere", kind: "directed" }],
        }),
        narration: [],
      }),
    );
    assert.deepEqual(broadcaster.broadcastBeats, []);
  });
});

describe("TeachingLessonConductor asking for a picture", () => {
  const illustrationRequest = {
    prompt: "A line of parcels waiting on a belt.",
    size: "1024x1024",
    style: "diagram_sketch",
    alternativeText: "Parcels queued on a belt.",
    narration: [],
  } as const;

  it("shows the beat at once and draws the picture afterwards", async () => {
    const { session, drawer, broadcaster } = await harnessTeachingALesson();
    drawer.holdDrawings();

    const beat = await session.requestIllustration({ ...illustrationRequest });

    // The turn is free to carry on: the beat is out, the drawing is not finished.
    assert.equal(asImage(broadcaster.broadcastBeats[0]).request.size, "1024x1024");
    assert.equal(beat?.illustrationId, illustrationIdOf(illustrationRequest));
    assert.equal(drawer.requests.length, 1);
    drawer.releaseDrawings();
  });

  it("tells the page the picture is being drawn, then that it arrived", async () => {
    const { session, conductor, broadcaster } = await harnessTeachingALesson();

    await session.requestIllustration({ ...illustrationRequest });
    await conductor.dispose();

    assert.deepEqual(illustrationStatesBroadcast(broadcaster), ["generating", "ready"]);
  });

  it("never sends the picture's place on disk to the browser", async () => {
    const { session, conductor, broadcaster } = await harnessTeachingALesson();

    await session.requestIllustration({ ...illustrationRequest });
    await conductor.dispose();

    assert.doesNotMatch(JSON.stringify(broadcaster.sentMessages), /imagePath|\/tmp\//);
  });

  it("replays where every picture got to, for a page that reconnects", async () => {
    const { session, conductor } = await harnessTeachingALesson();

    await session.requestIllustration({ ...illustrationRequest });
    await new Promise((resolve) => setImmediate(resolve));
    const transcript = await conductor.getTranscript();

    assert.deepEqual(
      transcript?.illustrations.map((state) => state.status),
      ["ready"],
    );
  });

  it("says a failed drawing failed, and does not fail the turn", async () => {
    const { session, conductor, broadcaster, drawer, reportedErrors } =
      await harnessTeachingALesson();
    drawer.failureReason = "The proxy refused the prompt.";

    const beat = await session.requestIllustration({ ...illustrationRequest });
    await conductor.dispose();

    assert.notEqual(beat, null);
    assert.deepEqual(illustrationStatesBroadcast(broadcaster), ["generating", "failed"]);
    assert.deepEqual(reportedErrors, []);
  });

  it("offers no picture at all when there is no image provider", async () => {
    const { session, broadcaster } = await harnessTeachingALesson(lessonSetup(), {
      canDrawPictures: false,
    });

    const beat = await session.requestIllustration({ ...illustrationRequest });

    assert.equal(beat, null);
    assert.deepEqual(broadcaster.broadcastBeats, []);
  });

  it("tells the teaching prompt whether the lesson can draw pictures", async () => {
    const withPictures = await harnessTeachingALesson();
    const withoutPictures = await harnessTeachingALesson(lessonSetup(), {
      canDrawPictures: false,
    });

    assert.match(withPictures.sessionFactory.systemPrompts[0] ?? "", /show_illustration/);
    assert.doesNotMatch(withoutPictures.sessionFactory.systemPrompts[0] ?? "", /show_illustration/);
  });

  it("lets no drawing outlive the lesson as an unowned promise", async () => {
    await withNoUnhandledRejection(async () => {
      const { session, conductor, drawer } = await harnessTeachingALesson();
      drawer.holdDrawings();

      await session.requestIllustration({ ...illustrationRequest });
      const closing = conductor.dispose();
      drawer.releaseDrawings();
      await closing;
    });
  });
});

function illustrationStatesBroadcast(broadcaster: FakeBeatBroadcaster): string[] {
  const statuses: string[] = [];
  for (const message of broadcaster.sentMessages) {
    if (message.type === "illustration") {
      statuses.push(message.state.status);
    }
  }
  return statuses;
}

describe("TeachingLessonConductor when the learner asks to be quizzed", () => {
  it("asks the teaching session for a question about what it has taught", async () => {
    const { conductor, session } = await harnessTeachingALesson();
    await finishTurn(conductor, session);

    await conductor.requestQuiz();

    assert.match(session.prompts[1] ?? "", /ask_quiz_question/);
  });

  it("waits for a turn that is still teaching, rather than cutting it off", async () => {
    const { conductor, session, broadcaster } = await harnessTeachingALesson();

    await conductor.requestQuiz();

    assert.equal(session.prompts.length, 1);
    assert.equal(
      broadcaster.sentMessages.some(
        (message) => message.type === "notice" && /still teaching/i.test(message.text),
      ),
      true,
    );
  });

  it("does nothing when there is no lesson yet", async () => {
    const { conductor, sessionFactory } = await harness();

    await conductor.requestQuiz();

    assert.equal(sessionFactory.createdSessions.length, 0);
  });
});

/**
 * The learner presses a button that says exactly what they want. It is written down
 * as a fact about the learner, so every later turn is briefed with it, and the turn
 * that answers it does what it says rather than inferring anything.
 */
describe("TeachingLessonConductor when the learner asks for simpler or deeper", () => {
  it("writes down what the learner asked for", async () => {
    const { conductor, session, repository } = await harnessTeachingALesson();
    await finishTurn(conductor, session);

    await conductor.recordLearnerSignal("simpler");

    const signals = await repository.listLearnerSignals(LESSON_ID);
    assert.deepEqual(
      signals.map((signal) => signal.signal),
      ["simpler"],
    );
  });

  it("teaches the same idea again more plainly when the learner asks for simpler", async () => {
    const { conductor, session } = await harnessTeachingALesson();
    await finishTurn(conductor, session);

    await conductor.recordLearnerSignal("simpler");

    assert.match(session.prompts[1] ?? "", /same idea again/i);
  });

  it("goes deeper on the same idea when the learner asks for that", async () => {
    const { conductor, session } = await harnessTeachingALesson();
    await finishTurn(conductor, session);

    await conductor.recordLearnerSignal("go_deeper");

    assert.match(session.prompts[1] ?? "", /deeper/i);
  });

  it("briefs the next turn with what the learner asked for", async () => {
    const { conductor, session } = await harnessTeachingALesson();
    await finishTurn(conductor, session);
    await conductor.recordLearnerSignal("go_deeper");
    await finishTurn(conductor, session);

    await conductor.continueLesson();

    assert.match(session.prompts[2] ?? "", /asked to go deeper/i);
  });

  it("writes down a request made mid-turn, rather than losing it", async () => {
    const { conductor, repository, session } = await harnessTeachingALesson();

    await conductor.recordLearnerSignal("simpler");

    const signals = await repository.listLearnerSignals(LESSON_ID);
    assert.deepEqual(
      signals.map((signal) => signal.signal),
      ["simpler"],
    );
    assert.equal(session.prompts.length, 1);
  });

  it("says a request made mid-turn was noted, rather than starting a second turn", async () => {
    const { conductor, broadcaster } = await harnessTeachingALesson();

    await conductor.recordLearnerSignal("simpler");

    assert.equal(
      broadcaster.sentMessages.some(
        (message) => message.type === "notice" && /Noted/i.test(message.text),
      ),
      true,
    );
  });

  it("does nothing when there is no lesson yet", async () => {
    const { conductor, sessionFactory } = await harness();

    await conductor.recordLearnerSignal("simpler");

    assert.equal(sessionFactory.createdSessions.length, 0);
  });
});
