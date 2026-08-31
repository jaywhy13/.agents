import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  ExcalidrawElementSkeleton,
  SkeletonArrow,
  SkeletonShape,
} from "../../shared/visuals/excalidraw-skeleton.ts";
import { compileGraphDiagramToScene } from "../../shared/visuals/graph-diagram-compiler.ts";
import { RANK_GAP, NODE_WIDTH } from "../../shared/visuals/graph-diagram-layout.ts";
import { graphDiagramSpec } from "./support/graph-diagram-factory.ts";

function shapeWithId(
  elements: readonly ExcalidrawElementSkeleton[],
  id: string,
): SkeletonShape {
  const element = elements.find((candidate) => candidate.id === id);
  assert.ok(element !== undefined, `No element with id ${id}.`);
  assert.notEqual(element.type, "arrow");
  assert.notEqual(element.type, "text");
  return element as SkeletonShape;
}

function arrowWithId(
  elements: readonly ExcalidrawElementSkeleton[],
  id: string,
): SkeletonArrow {
  const element = elements.find((candidate) => candidate.id === id);
  assert.ok(element !== undefined, `No element with id ${id}.`);
  assert.equal(element.type, "arrow");
  return element as SkeletonArrow;
}

describe("compiling a graph diagram", () => {
  it("draws the same scene every time it compiles the same spec", () => {
    const spec = graphDiagramSpec();

    assert.deepEqual(compileGraphDiagramToScene(spec), compileGraphDiagramToScene(spec));
  });

  it("gives every element a seed taken from its id, not from a random source", () => {
    const scene = compileGraphDiagramToScene(graphDiagramSpec());
    const otherScene = compileGraphDiagramToScene(graphDiagramSpec());

    const seeds = scene.skeletonElements.map((element) => element.seed);
    const otherSeeds = otherScene.skeletonElements.map((element) => element.seed);
    assert.deepEqual(seeds, otherSeeds);
  });

  it("marks the scene as one this compiler produced", () => {
    const scene = compileGraphDiagramToScene(graphDiagramSpec());

    assert.equal(scene.source, "pi-teach:graph-diagram-compiler");
    assert.equal(scene.type, "excalidraw");
  });

  it("draws one shape per node", () => {
    const scene = compileGraphDiagramToScene(graphDiagramSpec());

    for (const nodeId of ["producer", "queue", "consumer"]) {
      assert.ok(
        scene.skeletonElements.some((element) => element.id === `queue-basics-node-${nodeId}`),
        `No shape for node ${nodeId}.`,
      );
    }
  });

  it("puts the node label inside the shape, so Excalidraw re-wraps it on edit", () => {
    const scene = compileGraphDiagramToScene(graphDiagramSpec());

    assert.equal(shapeWithId(scene.skeletonElements, "queue-basics-node-queue").label?.text, "Queue");
  });

  it("draws each node shape as the figure that shape means", () => {
    const scene = compileGraphDiagramToScene(
      graphDiagramSpec({
        nodes: [
          { nodeId: "start", label: "Start", shape: "endpoint" },
          { nodeId: "check", label: "Is it full?", shape: "decision" },
          { nodeId: "work", label: "Do the work", shape: "step" },
        ],
        edges: [],
        emphasis: null,
      }),
    );

    assert.equal(shapeWithId(scene.skeletonElements, "queue-basics-node-start").type, "ellipse");
    assert.equal(shapeWithId(scene.skeletonElements, "queue-basics-node-check").type, "diamond");
    assert.equal(shapeWithId(scene.skeletonElements, "queue-basics-node-work").type, "rectangle");
  });

  it("binds each arrow to the two shapes it joins, so a dragged box keeps its arrow", () => {
    const scene = compileGraphDiagramToScene(graphDiagramSpec());

    const arrow = arrowWithId(scene.skeletonElements, "queue-basics-edge-put");
    assert.deepEqual(arrow.start, { id: "queue-basics-node-producer" });
    assert.deepEqual(arrow.end, { id: "queue-basics-node-queue" });
  });

  it("gives a directed edge an arrowhead", () => {
    const scene = compileGraphDiagramToScene(graphDiagramSpec());

    assert.equal(arrowWithId(scene.skeletonElements, "queue-basics-edge-put").endArrowhead, "arrow");
  });

  it("leaves an undirected edge without an arrowhead", () => {
    const scene = compileGraphDiagramToScene(
      graphDiagramSpec({
        edges: [
          { edgeId: "relates", fromNodeId: "producer", toNodeId: "queue", kind: "undirected" },
        ],
        emphasis: null,
      }),
    );

    assert.equal(
      arrowWithId(scene.skeletonElements, "queue-basics-edge-relates").endArrowhead,
      null,
    );
  });

  it("labels an edge that carries a meaning of its own", () => {
    const scene = compileGraphDiagramToScene(graphDiagramSpec());

    assert.equal(
      arrowWithId(scene.skeletonElements, "queue-basics-edge-put").label?.text,
      "puts work on",
    );
  });

  it("leaves an unlabelled edge unlabelled", () => {
    const scene = compileGraphDiagramToScene(graphDiagramSpec());

    assert.equal(arrowWithId(scene.skeletonElements, "queue-basics-edge-take").label, null);
  });

  it("puts the title on the scene as its own text", () => {
    const scene = compileGraphDiagramToScene(graphDiagramSpec());

    const title = scene.skeletonElements.find((element) => element.id === "queue-basics-title");
    assert.equal(title?.type, "text");
  });
});

describe("compiling emphasis", () => {
  it("draws an emphasised node differently from a plain one", () => {
    const scene = compileGraphDiagramToScene(graphDiagramSpec());

    const emphasized = shapeWithId(scene.skeletonElements, "queue-basics-node-queue");
    const plain = shapeWithId(scene.skeletonElements, "queue-basics-node-producer");
    assert.notEqual(emphasized.strokeColor, plain.strokeColor);
    assert.ok(emphasized.strokeWidth > plain.strokeWidth);
  });

  it("draws an emphasised edge differently from a plain one", () => {
    const scene = compileGraphDiagramToScene(
      graphDiagramSpec({ emphasis: { nodeIds: [], edgeIds: ["put"] } }),
    );

    const emphasized = arrowWithId(scene.skeletonElements, "queue-basics-edge-put");
    const plain = arrowWithId(scene.skeletonElements, "queue-basics-edge-take");
    assert.notEqual(emphasized.strokeColor, plain.strokeColor);
  });
});

describe("compiling groups", () => {
  it("draws a box around the nodes in a group", () => {
    const scene = compileGraphDiagramToScene(
      graphDiagramSpec({
        groups: [{ groupId: "broker", label: "The broker", memberNodeIds: ["queue"] }],
        emphasis: null,
      }),
    );

    const box = shapeWithId(scene.skeletonElements, "queue-basics-group-broker");
    const member = shapeWithId(scene.skeletonElements, "queue-basics-node-queue");
    assert.ok(box.x < member.x, "The group box should start left of its member.");
    assert.ok(box.y < member.y, "The group box should start above its member.");
    assert.ok(box.x + box.width > member.x + member.width);
  });

  it("draws the group box before its members, so the members sit on top", () => {
    const scene = compileGraphDiagramToScene(
      graphDiagramSpec({
        groups: [{ groupId: "broker", label: "The broker", memberNodeIds: ["queue"] }],
        emphasis: null,
      }),
    );

    const ids = scene.skeletonElements.map((element) => element.id);
    assert.ok(
      ids.indexOf("queue-basics-group-broker") < ids.indexOf("queue-basics-node-queue"),
    );
  });

  it("gives a group's box and members one selection group, so they move together", () => {
    const scene = compileGraphDiagramToScene(
      graphDiagramSpec({
        groups: [{ groupId: "broker", label: "The broker", memberNodeIds: ["queue"] }],
        emphasis: null,
      }),
    );

    const box = shapeWithId(scene.skeletonElements, "queue-basics-group-broker");
    const member = shapeWithId(scene.skeletonElements, "queue-basics-node-queue");
    assert.deepEqual(box.groupIds, member.groupIds);
    assert.deepEqual(box.groupIds, ["queue-basics-group-broker"]);
  });
});

describe("laying out a graph diagram", () => {
  it("puts a node one rank after the node that points at it", () => {
    const scene = compileGraphDiagramToScene(graphDiagramSpec());

    const producer = shapeWithId(scene.skeletonElements, "queue-basics-node-producer");
    const queue = shapeWithId(scene.skeletonElements, "queue-basics-node-queue");
    assert.equal(queue.x - producer.x, NODE_WIDTH + RANK_GAP);
  });

  it("reads top to bottom when the spec asks it to", () => {
    const scene = compileGraphDiagramToScene(graphDiagramSpec({ direction: "top_to_bottom" }));

    const producer = shapeWithId(scene.skeletonElements, "queue-basics-node-producer");
    const queue = shapeWithId(scene.skeletonElements, "queue-basics-node-queue");
    assert.equal(producer.x, queue.x);
    assert.ok(queue.y > producer.y);
  });

  it("puts two nodes with the same rank side by side, not on top of each other", () => {
    const scene = compileGraphDiagramToScene(
      graphDiagramSpec({
        nodes: [
          { nodeId: "source", label: "Source" },
          { nodeId: "first", label: "First reader" },
          { nodeId: "second", label: "Second reader" },
        ],
        edges: [
          { edgeId: "to-first", fromNodeId: "source", toNodeId: "first" },
          { edgeId: "to-second", fromNodeId: "source", toNodeId: "second" },
        ],
        emphasis: null,
      }),
    );

    const first = shapeWithId(scene.skeletonElements, "queue-basics-node-first");
    const second = shapeWithId(scene.skeletonElements, "queue-basics-node-second");
    assert.equal(first.x, second.x);
    assert.notEqual(first.y, second.y);
  });

  it("settles on one arrangement for a diagram that loops back on itself", () => {
    const loopingSpec = graphDiagramSpec({
      edges: [
        { edgeId: "put", fromNodeId: "producer", toNodeId: "queue" },
        { edgeId: "take", fromNodeId: "queue", toNodeId: "consumer" },
        { edgeId: "retry", fromNodeId: "consumer", toNodeId: "producer" },
      ],
      emphasis: null,
    });

    assert.deepEqual(
      compileGraphDiagramToScene(loopingSpec),
      compileGraphDiagramToScene(loopingSpec),
    );
  });
});
