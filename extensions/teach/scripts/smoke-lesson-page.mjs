#!/usr/bin/env node
/**
 * Serves the built lesson page with a stand-in lesson, for looking at it by hand.
 *
 * There is no model and no proxy behind it: the beats are fixed, so every beat kind
 * can be looked at, tabbed through, and read by a screen reader without running a
 * real lesson. Voice answers 503, which is exactly what a pi session with no
 * Shopify AI Proxy credential does, so the "voice is unavailable" path is what you
 * see unless you pass `--with-voice`.
 *
 *   node scripts/smoke-lesson-page.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ConnectionHub } from "../src/server/connection-hub.ts";
import { LessonServer } from "../src/server/lesson-server.ts";
import { StaticAssetRepository } from "../src/server/static-asset-repository.ts";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDirectory = path.join(packageDirectory, "dist", "public");

const LESSON_ID = "lesson-smoke01";
const ILLUSTRATION_ID = "d".repeat(64);

function envelope(beatId, sequenceNumber) {
  return {
    beatId,
    lessonId: LESSON_ID,
    sequenceNumber,
    createdAt: "2024-05-01T10:00:00.000Z",
  };
}

const beats = [
  {
    kind: "concept_card",
    ...envelope("beat-1", 1),
    title: "What a queue is",
    plainLanguageSummary: "A queue holds work until a worker is free.",
    keyPoints: ["Work waits in line.", "Workers take the oldest item first."],
    narrationScript: "A queue holds work until a worker is free.",
    pauseForLearner: true,
  },
  {
    kind: "diagram",
    ...envelope("beat-2", 2),
    spec: {
      diagramId: "queue-basics",
      revision: 1,
      title: "How a message queue moves work",
      direction: "left_to_right",
      nodes: [
        { nodeId: "producer", label: "Producer", shape: "endpoint" },
        { nodeId: "queue", label: "Queue", shape: "step" },
        { nodeId: "consumer", label: "Consumer", shape: "endpoint" },
      ],
      edges: [
        {
          edgeId: "put",
          fromNodeId: "producer",
          toNodeId: "queue",
          kind: "directed",
          label: "puts work on",
        },
        { edgeId: "take", fromNodeId: "queue", toNodeId: "consumer", kind: "directed", label: null },
      ],
      groups: [],
      emphasis: { nodeIds: ["queue"], edgeIds: [] },
    },
  },
  {
    // The same diagram again, taught with more on it. Revision 2 must be drawn as it
    // was taught, even when the learner has moved the boxes of revision 1 about.
    kind: "diagram",
    ...envelope("beat-2b", 3),
    spec: {
      diagramId: "queue-basics",
      revision: 2,
      title: "How a message queue moves work, with a dead letter queue",
      direction: "left_to_right",
      nodes: [
        { nodeId: "producer", label: "Producer", shape: "endpoint" },
        { nodeId: "queue", label: "Queue", shape: "step" },
        { nodeId: "consumer", label: "Consumer", shape: "endpoint" },
        { nodeId: "dead-letters", label: "Dead letter queue", shape: "step" },
      ],
      edges: [
        {
          edgeId: "put",
          fromNodeId: "producer",
          toNodeId: "queue",
          kind: "directed",
          label: "puts work on",
        },
        { edgeId: "take", fromNodeId: "queue", toNodeId: "consumer", kind: "directed", label: null },
        {
          edgeId: "give-up",
          fromNodeId: "consumer",
          toNodeId: "dead-letters",
          kind: "directed",
          label: "gives up on",
        },
      ],
      groups: [],
      emphasis: { nodeIds: ["dead-letters"], edgeIds: [] },
    },
  },
  {
    kind: "image",
    ...envelope("beat-3", 4),
    illustrationId: ILLUSTRATION_ID,
    request: {
      prompt: "A line of parcels waiting on a conveyor belt for one worker.",
      size: "1024x1024",
      style: "diagram_sketch",
      alternativeText: "Parcels queued on a belt, with one worker taking the front parcel.",
    },
  },
  {
    kind: "quiz",
    ...envelope("beat-4", 5),
    questionId: "queue-order-1",
    question: "Which item does a worker take first?",
    answerFormat: "multiple_choice",
    choices: [
      { choiceId: "a", text: "The oldest" },
      { choiceId: "b", text: "The newest" },
    ],
    // Deliberately present here, to prove the server drops it on the way out.
    correctChoiceIds: ["a"],
    explanation: "A queue is first in, first out.",
    relatedTerms: ["queue"],
  },
  {
    kind: "pause",
    ...envelope("beat-5", 6),
    reason: "Look at the diagram before the next idea.",
    suggestedWaitSeconds: 20,
  },
];

/** A one pixel PNG, so the picture path can be looked at without a provider. */
const STAND_IN_PICTURE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const conductor = {
  async getTranscript() {
    return {
      metadata: {
        lessonId: LESSON_ID,
        topic: "How a message queue works",
        status: "paused",
        createdAt: "2024-05-01T10:00:00.000Z",
        updatedAt: "2024-05-01T10:00:00.000Z",
        references: [],
        beatCount: beats.length,
      },
      beats,
      quizAttempts: [],
      illustrations: [
        process.argv.includes("--picture-ready")
          ? {
              status: "ready",
              illustrationId: ILLUSTRATION_ID,
              lessonId: LESSON_ID,
              alternativeText:
                "Parcels queued on a belt, with one worker taking the front parcel.",
              mediaType: "image/png",
              byteCount: STAND_IN_PICTURE.byteLength,
              readyAt: "2024-05-01T10:00:01.000Z",
            }
          : {
              status: "failed",
              illustrationId: ILLUSTRATION_ID,
              lessonId: LESSON_ID,
              alternativeText:
                "Parcels queued on a belt, with one worker taking the front parcel.",
              reason: "there is no image provider in this smoke run",
              failedAt: "2024-05-01T10:00:01.000Z",
            },
      ],
    };
  },
  async startLesson() {},
  async answerQuestion() {},
  async submitQuizAnswer() {},
  async requestDefinition() {},
  async requestQuiz() {},
  async recordLearnerSignal() {},
  async continueLesson() {},
  async interrupt() {},
  async dispose() {},
};

const server = new LessonServer({
  conductor,
  connectionHub: new ConnectionHub(),
  staticAssetRepository: new StaticAssetRepository(publicDirectory),
  voice: process.argv.includes("--with-voice") ? null : null,
  images: {
    async readBytes(illustrationId) {
      return illustrationId === ILLUSTRATION_ID && process.argv.includes("--picture-ready")
        ? new Uint8Array(STAND_IN_PICTURE)
        : null;
    },
  },
  onError: (error) => console.error("lesson server:", error.message),
});

const running = await server.start();
console.log(running.url);

process.on("SIGINT", () => {
  void server.stop().then(() => process.exit(0));
});
