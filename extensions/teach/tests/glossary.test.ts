import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Beat, DefinitionBeat } from "../shared/beat.ts";
import { glossaryFromBeats, glossaryTermNames } from "../shared/glossary.ts";

function definitionBeat(overrides: Partial<DefinitionBeat> = {}): DefinitionBeat {
  return {
    kind: "definition",
    beatId: "beat-1",
    lessonId: "lesson-1",
    sequenceNumber: 1,
    createdAt: "2024-05-01T10:00:00.000Z",
    term: "queue",
    fullForm: null,
    plainLanguageMeaning: "A line of work waiting for a worker.",
    example: null,
    ...overrides,
  };
}

function conceptCardBeat(): Beat {
  return {
    kind: "concept_card",
    beatId: "beat-card",
    lessonId: "lesson-1",
    sequenceNumber: 2,
    createdAt: "2024-05-01T10:00:00.000Z",
    title: "What a queue is",
    plainLanguageSummary: "A queue holds work.",
    keyPoints: ["Work waits in line."],
    narrationScript: "A queue holds work.",
    pauseForLearner: true,
  };
}

describe("glossaryFromBeats", () => {
  it("collects one entry for each definition beat", () => {
    const glossary = glossaryFromBeats([
      definitionBeat({ beatId: "beat-1", term: "queue" }),
      definitionBeat({ beatId: "beat-2", term: "worker", sequenceNumber: 2 }),
    ]);

    assert.deepEqual(
      glossary.map((entry) => entry.term),
      ["queue", "worker"],
    );
  });

  it("ignores beats that are not definitions", () => {
    const glossary = glossaryFromBeats([conceptCardBeat()]);

    assert.deepEqual(glossary, []);
  });

  it("keeps the newest meaning when the same term is defined twice", () => {
    const glossary = glossaryFromBeats([
      definitionBeat({ beatId: "beat-1", plainLanguageMeaning: "First try." }),
      definitionBeat({ beatId: "beat-2", sequenceNumber: 2, plainLanguageMeaning: "Clearer try." }),
    ]);

    assert.equal(glossary.length, 1);
    assert.equal(glossary[0]?.plainLanguageMeaning, "Clearer try.");
  });

  it("treats a term redefined with different capitals as the same term", () => {
    const glossary = glossaryFromBeats([
      definitionBeat({ beatId: "beat-1", term: "Queue" }),
      definitionBeat({ beatId: "beat-2", sequenceNumber: 2, term: "queue" }),
    ]);

    assert.equal(glossary.length, 1);
  });

  it("orders the panel alphabetically, so the learner can scan it", () => {
    const glossary = glossaryFromBeats([
      definitionBeat({ beatId: "beat-1", term: "worker" }),
      definitionBeat({ beatId: "beat-2", sequenceNumber: 2, term: "Broker" }),
      definitionBeat({ beatId: "beat-3", sequenceNumber: 3, term: "queue" }),
    ]);

    assert.deepEqual(
      glossary.map((entry) => entry.term),
      ["Broker", "queue", "worker"],
    );
  });

  it("carries the full form of an acronym into the panel", () => {
    const glossary = glossaryFromBeats([
      definitionBeat({ term: "FSM", fullForm: "Finite State Machine" }),
    ]);

    assert.equal(glossary[0]?.fullForm, "Finite State Machine");
  });
});

describe("glossaryTermNames", () => {
  it("lists the term of every entry, which is what a teaching turn is told about", () => {
    const names = glossaryTermNames(
      glossaryFromBeats([
        definitionBeat({ beatId: "beat-1", term: "queue" }),
        definitionBeat({ beatId: "beat-2", sequenceNumber: 2, term: "worker" }),
      ]),
    );

    assert.deepEqual(names, ["queue", "worker"]);
  });

  it("also lists the full form of an acronym, so it is highlighted as well", () => {
    const names = glossaryTermNames(
      glossaryFromBeats([definitionBeat({ term: "FSM", fullForm: "Finite State Machine" })]),
    );

    assert.deepEqual(names, ["FSM", "Finite State Machine"]);
  });
});
