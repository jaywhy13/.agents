import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeDiagramForReading } from "../../shared/visuals/diagram-outline.ts";
import { graphDiagramSpec } from "./support/graph-diagram-factory.ts";

describe("describing a diagram in words", () => {
  it("lists every node the diagram draws", () => {
    const outline = describeDiagramForReading(graphDiagramSpec());

    assert.deepEqual(
      outline.nodes.map((node) => node.label),
      ["Producer", "Queue", "Consumer"],
    );
  });

  it("reads a directed join as one thing leading to another", () => {
    const outline = describeDiagramForReading(graphDiagramSpec());

    assert.equal(outline.joins[1]?.sentence, "Queue leads to Consumer");
  });

  it("reads an undirected join as a relation, not a sequence", () => {
    const outline = describeDiagramForReading(
      graphDiagramSpec({
        edges: [
          { edgeId: "pair", fromNodeId: "producer", toNodeId: "consumer", kind: "undirected" },
        ],
        emphasis: null,
      }),
    );

    assert.equal(outline.joins[0]?.sentence, "Producer relates to Consumer");
  });

  it("includes the edge label, so the join keeps its meaning", () => {
    const outline = describeDiagramForReading(graphDiagramSpec());

    assert.equal(outline.joins[0]?.sentence, "Producer leads to Queue (puts work on)");
  });

  it("says which group a node is in", () => {
    const outline = describeDiagramForReading(
      graphDiagramSpec({
        groups: [{ groupId: "broker", label: "The broker", memberNodeIds: ["queue"] }],
        emphasis: null,
      }),
    );

    assert.equal(outline.nodes[1]?.groupLabel, "The broker");
  });

  it("marks the parts the beat is about", () => {
    const outline = describeDiagramForReading(graphDiagramSpec());

    assert.deepEqual(
      outline.nodes.filter((node) => node.isEmphasized).map((node) => node.label),
      ["Queue"],
    );
  });

  it("keeps the diagram title, so the description names what it describes", () => {
    const outline = describeDiagramForReading(graphDiagramSpec());

    assert.equal(outline.title, "How a message queue moves work");
  });
});
