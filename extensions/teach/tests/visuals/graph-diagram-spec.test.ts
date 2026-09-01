import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FIRST_DIAGRAM_REVISION,
  groupByNodeIdIn,
  InvalidGraphDiagramError,
  MOST_DIAGRAM_REVISIONS,
  LONGEST_NODE_LABEL_CHARACTERS,
  MOST_EMPHASIZED_PARTS,
  MOST_NODES,
  nodesByIdIn,
  parseGraphDiagramSpec,
} from "../../shared/visuals/graph-diagram-spec.ts";
import { graphDiagramSpec, graphDiagramSpecInput } from "./support/graph-diagram-factory.ts";

/**
 * A lesson draws a diagram in stages: the same diagram, with more on it each time.
 * The revision says which drawing this is, so the page can tell a new taught drawing
 * apart from the one the learner has been editing.
 */
describe("which drawing of a diagram this is", () => {
  it("is the first revision when the lesson does not say", () => {
    const spec = parseGraphDiagramSpec(graphDiagramSpecInput());

    assert.equal(spec.revision, FIRST_DIAGRAM_REVISION);
  });

  it("keeps the revision the lesson gave", () => {
    const spec = parseGraphDiagramSpec(graphDiagramSpecInput({ revision: 3 }));

    assert.equal(spec.revision, 3);
  });

  it("refuses a revision that is not a counting number", () => {
    assert.throws(
      () => parseGraphDiagramSpec(graphDiagramSpecInput({ revision: 0 })),
      InvalidGraphDiagramError,
    );
    assert.throws(
      () => parseGraphDiagramSpec(graphDiagramSpecInput({ revision: 1.5 })),
      InvalidGraphDiagramError,
    );
    assert.throws(
      () => parseGraphDiagramSpec(graphDiagramSpecInput({ revision: "2" })),
      InvalidGraphDiagramError,
    );
  });

  it("refuses more revisions than a lesson could usefully show", () => {
    assert.throws(
      () => parseGraphDiagramSpec(graphDiagramSpecInput({ revision: MOST_DIAGRAM_REVISIONS + 1 })),
      InvalidGraphDiagramError,
    );
  });
});

describe("graph diagram spec shape", () => {
  it("keeps the nodes in the order they were declared", () => {
    const spec = parseGraphDiagramSpec(graphDiagramSpecInput());

    assert.deepEqual(
      spec.nodes.map((node) => node.nodeId),
      ["producer", "queue", "consumer"],
    );
  });

  it("treats a node with no shape as a step", () => {
    const spec = parseGraphDiagramSpec(
      graphDiagramSpecInput({ nodes: [{ nodeId: "only", label: "Only" }], edges: [], emphasis: null }),
    );

    assert.equal(spec.nodes[0]?.shape, "step");
  });

  it("treats an edge with no kind as directed", () => {
    const spec = parseGraphDiagramSpec(
      graphDiagramSpecInput({
        edges: [{ edgeId: "put", fromNodeId: "producer", toNodeId: "queue" }],
        emphasis: null,
      }),
    );

    assert.equal(spec.edges[0]?.kind, "directed");
  });

  it("treats a diagram with no emphasis as emphasising nothing", () => {
    const spec = parseGraphDiagramSpec(graphDiagramSpecInput({ emphasis: null }));

    assert.deepEqual(spec.emphasis, { nodeIds: [], edgeIds: [] });
  });

  it("trims a label, so spacing cannot change the drawing", () => {
    const spec = parseGraphDiagramSpec(
      graphDiagramSpecInput({
        nodes: [{ nodeId: "only", label: "  Only  " }],
        edges: [],
        emphasis: null,
      }),
    );

    assert.equal(spec.nodes[0]?.label, "Only");
  });
});

describe("graph diagram spec validation", () => {
  it("refuses a diagram with no nodes, because there is nothing to draw", () => {
    assert.throws(
      () => parseGraphDiagramSpec(graphDiagramSpecInput({ nodes: [], edges: [], emphasis: null })),
      InvalidGraphDiagramError,
    );
  });

  it("refuses more nodes than fit in one readable diagram", () => {
    const tooManyNodes = Array.from({ length: MOST_NODES + 1 }, (_unused, index) => ({
      nodeId: `node-${index}`,
      label: `Node ${index}`,
    }));

    assert.throws(
      () =>
        parseGraphDiagramSpec(
          graphDiagramSpecInput({ nodes: tooManyNodes, edges: [], emphasis: null }),
        ),
      /nodes must list/,
    );
  });

  it("refuses a repeated node id", () => {
    assert.throws(
      () =>
        parseGraphDiagramSpec(
          graphDiagramSpecInput({
            nodes: [
              { nodeId: "same", label: "First" },
              { nodeId: "same", label: "Second" },
            ],
            edges: [],
            emphasis: null,
          }),
        ),
      /repeats "same"/,
    );
  });

  it("refuses a label too long to fit in a box", () => {
    const tooLongLabel = "x".repeat(LONGEST_NODE_LABEL_CHARACTERS + 1);

    assert.throws(
      () =>
        parseGraphDiagramSpec(
          graphDiagramSpecInput({
            nodes: [{ nodeId: "only", label: tooLongLabel }],
            edges: [],
            emphasis: null,
          }),
        ),
      /at most 60 characters/,
    );
  });

  it("refuses a node id that could climb out of a directory", () => {
    assert.throws(
      () =>
        parseGraphDiagramSpec(
          graphDiagramSpecInput({
            nodes: [{ nodeId: "../escape", label: "Escape" }],
            edges: [],
            emphasis: null,
          }),
        ),
      InvalidGraphDiagramError,
    );
  });

  it("refuses an edge that names a node the diagram does not have", () => {
    assert.throws(
      () =>
        parseGraphDiagramSpec(
          graphDiagramSpecInput({
            edges: [{ edgeId: "stray", fromNodeId: "producer", toNodeId: "nowhere" }],
            emphasis: null,
          }),
        ),
      /"nowhere", which is not a node/,
    );
  });

  it("refuses an edge that joins a node to itself", () => {
    assert.throws(
      () =>
        parseGraphDiagramSpec(
          graphDiagramSpecInput({
            edges: [{ edgeId: "loop", fromNodeId: "queue", toNodeId: "queue" }],
            emphasis: null,
          }),
        ),
      /to itself/,
    );
  });

  it("refuses a second line drawn between the same two nodes the same way", () => {
    assert.throws(
      () =>
        parseGraphDiagramSpec(
          graphDiagramSpecInput({
            edges: [
              { edgeId: "first", fromNodeId: "producer", toNodeId: "queue" },
              { edgeId: "second", fromNodeId: "producer", toNodeId: "queue" },
            ],
            emphasis: null,
          }),
        ),
      /second line/,
    );
  });

  it("allows a line back the other way, because that is a different meaning", () => {
    const spec = parseGraphDiagramSpec(
      graphDiagramSpecInput({
        edges: [
          { edgeId: "there", fromNodeId: "producer", toNodeId: "queue" },
          { edgeId: "back", fromNodeId: "queue", toNodeId: "producer" },
        ],
        emphasis: null,
      }),
    );

    assert.equal(spec.edges.length, 2);
  });

  it("treats an undirected join as the same join whichever end is written first", () => {
    assert.throws(
      () =>
        parseGraphDiagramSpec(
          graphDiagramSpecInput({
            edges: [
              { edgeId: "first", fromNodeId: "producer", toNodeId: "queue", kind: "undirected" },
              { edgeId: "second", fromNodeId: "queue", toNodeId: "producer", kind: "undirected" },
            ],
            emphasis: null,
          }),
        ),
      /second line/,
    );
  });

  it("refuses a node placed in two groups at once", () => {
    assert.throws(
      () =>
        parseGraphDiagramSpec(
          graphDiagramSpecInput({
            groups: [
              { groupId: "left", label: "Left", memberNodeIds: ["queue"] },
              { groupId: "right", label: "Right", memberNodeIds: ["queue"] },
            ],
            emphasis: null,
          }),
        ),
      /belongs to one group/,
    );
  });

  it("refuses a group that names a node the diagram does not have", () => {
    assert.throws(
      () =>
        parseGraphDiagramSpec(
          graphDiagramSpecInput({
            groups: [{ groupId: "side", label: "Side", memberNodeIds: ["nowhere"] }],
            emphasis: null,
          }),
        ),
      /which is not a node/,
    );
  });

  it("refuses emphasis on something that is not in the diagram", () => {
    assert.throws(
      () =>
        parseGraphDiagramSpec(
          graphDiagramSpecInput({ emphasis: { nodeIds: ["nowhere"], edgeIds: [] } }),
        ),
      /which is not a node/,
    );
  });

  it("refuses emphasising more nodes than a learner can hold at once", () => {
    const manyNodes = Array.from({ length: MOST_EMPHASIZED_PARTS + 1 }, (_unused, index) => ({
      nodeId: `node-${index}`,
      label: `Node ${index}`,
    }));

    assert.throws(
      () =>
        parseGraphDiagramSpec(
          graphDiagramSpecInput({
            nodes: manyNodes,
            edges: [],
            emphasis: { nodeIds: manyNodes.map((node) => node.nodeId), edgeIds: [] },
          }),
        ),
      /emphasis.nodeIds must list 0 to 8/,
    );
  });

  it("counts emphasised nodes and edges together against the cap", () => {
    const nodes = Array.from({ length: 6 }, (_unused, index) => ({
      nodeId: `node-${index}`,
      label: `Node ${index}`,
    }));
    const edges = Array.from({ length: 5 }, (_unused, index) => ({
      edgeId: `edge-${index}`,
      fromNodeId: `node-${index}`,
      toNodeId: `node-${index + 1}`,
    }));

    assert.throws(
      () =>
        parseGraphDiagramSpec(
          graphDiagramSpecInput({
            nodes,
            edges,
            emphasis: {
              nodeIds: nodes.slice(0, 5).map((node) => node.nodeId),
              edgeIds: edges.slice(0, 4).map((edge) => edge.edgeId),
            },
          }),
        ),
      /at most 8 parts in total/,
    );
  });
});

describe("graph diagram spec accessors", () => {
  it("finds a node by its id", () => {
    const spec = graphDiagramSpec();

    assert.equal(nodesByIdIn(spec).get("queue")?.label, "Queue");
  });

  it("says which group a node is in", () => {
    const spec = graphDiagramSpec({
      groups: [{ groupId: "broker", label: "The broker", memberNodeIds: ["queue"] }],
    });

    assert.equal(groupByNodeIdIn(spec).get("queue")?.label, "The broker");
  });

  it("says nothing for a node that stands alone", () => {
    const spec = graphDiagramSpec();

    assert.equal(groupByNodeIdIn(spec).get("queue"), undefined);
  });
});
