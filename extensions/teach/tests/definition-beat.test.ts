import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DefinitionBeat } from "../shared/beat.ts";
import { parseBeat, parseDefinitionBeat } from "../shared/beat.ts";

function definitionPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "definition",
    beatId: "beat-2",
    lessonId: "lesson-1",
    sequenceNumber: 2,
    createdAt: "2024-05-01T10:00:00.000Z",
    term: "Finite State Machine",
    fullForm: null,
    plainLanguageMeaning: "A model that is in exactly one of a fixed set of states at a time.",
    example: "A traffic light is red, then amber, then green.",
    ...overrides,
  };
}

describe("parseDefinitionBeat", () => {
  it("returns a typed definition beat for a valid payload", () => {
    const beat: DefinitionBeat = parseDefinitionBeat(definitionPayload());

    assert.equal(beat.kind, "definition");
    assert.equal(beat.term, "Finite State Machine");
    assert.equal(
      beat.plainLanguageMeaning,
      "A model that is in exactly one of a fixed set of states at a time.",
    );
  });

  it("keeps the full form of an acronym", () => {
    const beat = parseDefinitionBeat(
      definitionPayload({ term: "FSM", fullForm: "Finite State Machine" }),
    );

    assert.equal(beat.fullForm, "Finite State Machine");
  });

  it("treats a missing full form as no full form, because most terms are not acronyms", () => {
    const beat = parseDefinitionBeat(definitionPayload({ fullForm: undefined }));

    assert.equal(beat.fullForm, null);
  });

  it("treats a missing example as no example, because an example is optional", () => {
    const beat = parseDefinitionBeat(definitionPayload({ example: undefined }));

    assert.equal(beat.example, null);
  });

  it("rejects a definition whose term is blank", () => {
    assert.throws(() => parseDefinitionBeat(definitionPayload({ term: "  " })), /term/);
  });

  it("rejects a definition with no plain language meaning", () => {
    assert.throws(
      () => parseDefinitionBeat(definitionPayload({ plainLanguageMeaning: "" })),
      /plainLanguageMeaning/,
    );
  });

  it("rejects a full form that is present but blank, so the page never shows an empty bracket", () => {
    assert.throws(() => parseDefinitionBeat(definitionPayload({ fullForm: "   " })), /fullForm/);
  });

  it("is reached through parseBeat, so a stored definition beat can be replayed", () => {
    const beat = parseBeat(definitionPayload());

    assert.equal(beat.kind, "definition");
  });
});
