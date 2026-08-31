import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBeat, parseDiagramBeat } from "../shared/beat.ts";
import { graphDiagramSpecInput } from "./visuals/support/graph-diagram-factory.ts";

function diagramPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "diagram",
    beatId: "beat-9",
    lessonId: "lesson-1",
    sequenceNumber: 9,
    createdAt: "2024-05-01T10:00:00.000Z",
    spec: graphDiagramSpecInput(),
    ...overrides,
  };
}

describe("parseDiagramBeat", () => {
  it("returns the diagram the lesson described", () => {
    const beat = parseDiagramBeat(diagramPayload());

    assert.equal(beat.kind, "diagram");
    assert.equal(beat.spec.title, "How a message queue moves work");
    assert.equal(beat.spec.nodes.length, 3);
  });

  it("keeps which parts the lesson wants the learner to notice", () => {
    assert.deepEqual(parseDiagramBeat(diagramPayload()).spec.emphasis.nodeIds, ["queue"]);
  });

  it("refuses a diagram whose edge names a part that is not there, and says which field", () => {
    assert.throws(
      () =>
        parseDiagramBeat(
          diagramPayload({
            spec: graphDiagramSpecInput({
              edges: [
                { edgeId: "put", fromNodeId: "producer", toNodeId: "nowhere", kind: "directed" },
              ],
            }),
          }),
        ),
      /toNodeId|nowhere/,
    );
  });

  it("refuses a beat with no diagram at all", () => {
    assert.throws(() => parseDiagramBeat(diagramPayload({ spec: undefined })), /spec|object/);
  });

  it("is reached through parseBeat, so a stored diagram can be replayed", () => {
    const beat = parseBeat(diagramPayload());

    assert.equal(beat.kind, "diagram");
  });
});
