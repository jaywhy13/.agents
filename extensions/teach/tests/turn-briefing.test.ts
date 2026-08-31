import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Beat } from "../shared/beat.ts";
import type { LearnerModel } from "../src/domain/learner-model.ts";
import { buildTurnBriefing, RECENT_BEAT_COUNT } from "../src/domain/turn-briefing.ts";

function learnerModel(overrides: Partial<LearnerModel> = {}): LearnerModel {
  return {
    depthLevel: 3,
    knownTerms: [],
    shakyTerms: [],
    pacePreference: "steady",
    answeredQuestionCount: 0,
    latestLearnerSignal: null,
    ...overrides,
  };
}

function conceptCard(sequenceNumber: number, title: string): Beat {
  return {
    kind: "concept_card",
    beatId: `beat-${sequenceNumber}`,
    lessonId: "lesson-1",
    sequenceNumber,
    createdAt: "2024-05-01T10:00:00.000Z",
    title,
    plainLanguageSummary: "One idea.",
    keyPoints: ["A point."],
    narrationScript: "One idea.",
    pauseForLearner: true,
  };
}

function briefingFor(overrides: {
  learnerModel?: LearnerModel;
  recentBeats?: readonly Beat[];
  glossaryTermNames?: readonly string[];
}): string {
  return buildTurnBriefing({
    learnerModel: overrides.learnerModel ?? learnerModel(),
    recentBeats: overrides.recentBeats ?? [],
    glossaryTermNames: overrides.glossaryTermNames ?? [],
  });
}

describe("buildTurnBriefing", () => {
  it("states the depth the next beat should be taught at", () => {
    assert.match(briefingFor({ learnerModel: learnerModel({ depthLevel: 4 }) }), /depth 4 of 5/i);
  });

  it("states the pace the learner has been keeping", () => {
    assert.match(
      briefingFor({ learnerModel: learnerModel({ pacePreference: "slower" }) }),
      /slower/i,
    );
  });

  it("names the terms the learner has shown they know", () => {
    assert.match(
      briefingFor({ learnerModel: learnerModel({ knownTerms: ["queue", "worker"] }) }),
      /queue, worker/,
    );
  });

  it("names the shaky terms and says to explain them again", () => {
    const briefing = briefingFor({ learnerModel: learnerModel({ shakyTerms: ["backpressure"] }) });

    assert.match(briefing, /backpressure/);
    assert.match(briefing, /again/i);
  });

  it("says nothing about explicit requests before the learner has made one", () => {
    const briefing = briefingFor({ learnerModel: learnerModel({ latestLearnerSignal: null }) });

    assert.doesNotMatch(briefing, /asked for this simpler/i);
    assert.doesNotMatch(briefing, /asked to go deeper/i);
  });

  it("passes on a request for a simpler explanation in the learner's own terms", () => {
    const briefing = briefingFor({
      learnerModel: learnerModel({ latestLearnerSignal: "simpler" }),
    });

    assert.match(briefing, /asked for this simpler/i);
  });

  it("passes on a request to go deeper", () => {
    const briefing = briefingFor({
      learnerModel: learnerModel({ latestLearnerSignal: "go_deeper" }),
    });

    assert.match(briefing, /asked to go deeper/i);
  });

  it("lists the glossary terms the learner has already been given", () => {
    assert.match(briefingFor({ glossaryTermNames: ["queue", "broker"] }), /queue, broker/);
  });

  it("says the glossary is empty rather than leaving the line out", () => {
    assert.match(briefingFor({}), /no terms yet/i);
  });

  it("lists the recent beats so the turn can build on them", () => {
    const briefing = briefingFor({
      recentBeats: [conceptCard(1, "What a queue is"), conceptCard(2, "What a worker is")],
    });

    assert.match(briefing, /What a queue is/);
    assert.match(briefing, /What a worker is/);
  });

  it("carries no full lesson history, so a long lesson does not bloat the turn", () => {
    const manyBeats: Beat[] = [];
    for (let sequenceNumber = 1; sequenceNumber <= 20; sequenceNumber += 1) {
      manyBeats.push(conceptCard(sequenceNumber, `Idea ${sequenceNumber}`));
    }

    const briefing = buildTurnBriefing({
      learnerModel: learnerModel(),
      recentBeats: manyBeats,
      glossaryTermNames: [],
    });

    assert.equal(briefing.includes("Idea 20"), true);
    assert.equal(briefing.includes("Idea 1\n"), false);
    assert.equal(
      briefing.split("\n").filter((line) => line.includes("Idea ")).length,
      RECENT_BEAT_COUNT,
    );
  });

  it("describes each kind of recent beat by what the learner saw", () => {
    const briefing = buildTurnBriefing({
      learnerModel: learnerModel(),
      recentBeats: [
        {
          kind: "definition",
          beatId: "beat-2",
          lessonId: "lesson-1",
          sequenceNumber: 2,
          createdAt: "2024-05-01T10:00:00.000Z",
          term: "backpressure",
          fullForm: null,
          plainLanguageMeaning: "Slowing the producer down.",
          example: null,
        },
        {
          kind: "pause",
          beatId: "beat-3",
          lessonId: "lesson-1",
          sequenceNumber: 3,
          createdAt: "2024-05-01T10:00:00.000Z",
          reason: "Let that settle.",
          suggestedWaitSeconds: 20,
        },
      ],
      glossaryTermNames: [],
    });

    assert.match(briefing, /Definition: backpressure/);
    assert.match(briefing, /Pause: Let that settle\./);
  });

  it("leaves narration out of the recent beats, because it is not something seen", () => {
    const briefing = buildTurnBriefing({
      learnerModel: learnerModel(),
      recentBeats: [
        conceptCard(1, "What a queue is"),
        {
          kind: "narration",
          beatId: "beat-2",
          lessonId: "lesson-1",
          sequenceNumber: 2,
          createdAt: "2024-05-01T10:00:00.000Z",
          relatedBeatId: "beat-1",
          chunks: [{ kind: "sentence", text: "A queue holds work." }],
        },
      ],
      glossaryTermNames: [],
    });

    assert.equal(briefing.includes("A queue holds work."), false);
  });
});
