/**
 * Turns a graph diagram spec into an Excalidraw scene.
 *
 * The compiler is a pure function of the spec: same spec in, byte-for-byte the same
 * scene out. Nothing is read from the clock, from a random source, or from the
 * environment, so a diagram can be recompiled at any time and compared, and a test
 * can assert on the whole scene.
 *
 * The output is a list of Excalidraw *skeletons*, which is the input Excalidraw's
 * supported `convertToExcalidrawElements` builder takes. Two things follow from
 * that choice: the compiler never has to reproduce Excalidraw's internal element
 * fields, and every arrow can name the two shapes it joins so the learner can drag
 * a box and keep the arrow attached.
 *
 * This module is pure: no node built-ins, so the lesson page can use it too.
 */

import type {
  DiagramSceneDraft,
  ExcalidrawElementSkeleton,
  SkeletonArrow,
  SkeletonBoundLabel,
  SkeletonShape,
  SkeletonShapeType,
  SkeletonText,
} from "./excalidraw-skeleton.ts";
import {
  COMPILED_SCENE_SOURCE,
  EXCALIDRAW_SCENE_TYPE,
  EXCALIDRAW_SCENE_VERSION,
  seedFromElementId,
} from "./excalidraw-skeleton.ts";
import type { GraphDiagramLayout, PlacedNode } from "./graph-diagram-layout.ts";
import { layOutGraphDiagram } from "./graph-diagram-layout.ts";
import type { GraphDiagramSpec, NodeShape } from "./graph-diagram-spec.ts";
import { isEmphasizedEdge, isEmphasizedNode } from "./graph-diagram-spec.ts";

const SCENE_BACKGROUND = "#ffffff";
const PLAIN_STROKE = "#1e1e1e";
const PLAIN_FILL = "#f8f9fa";
const EMPHASIZED_STROKE = "#1971c2";
const EMPHASIZED_FILL = "#d0ebff";
const GROUP_STROKE = "#adb5bd";
const GROUP_FILL = "transparent";
const TITLE_FONT_SIZE = 28;
const NODE_FONT_SIZE = 16;
const EDGE_FONT_SIZE = 14;
const GROUP_FONT_SIZE = 16;
const PLAIN_STROKE_WIDTH = 1;
const EMPHASIZED_STROKE_WIDTH = 2;
/** Zero keeps Excalidraw's lines straight rather than hand-drawn. A diagram the
 * lesson generated should not pretend to have been sketched by a person. */
const ARCHITECT_ROUGHNESS = 0;

export function compileGraphDiagramToScene(spec: GraphDiagramSpec): DiagramSceneDraft {
  const layout = layOutGraphDiagram(spec);

  return {
    type: EXCALIDRAW_SCENE_TYPE,
    version: EXCALIDRAW_SCENE_VERSION,
    source: COMPILED_SCENE_SOURCE,
    diagramId: spec.diagramId,
    // Order is paint order: group boxes sit behind their members, and arrows are
    // added after the shapes they bind to, which is what the builder expects.
    skeletonElements: [
      titleElement(spec),
      ...groupElements(spec, layout),
      ...nodeElements(spec, layout),
      ...edgeElements(spec),
    ],
    appState: { viewBackgroundColor: SCENE_BACKGROUND, gridSize: null },
  };
}

export function nodeElementId(spec: GraphDiagramSpec, nodeId: string): string {
  return `${spec.diagramId}-node-${nodeId}`;
}

export function edgeElementId(spec: GraphDiagramSpec, edgeId: string): string {
  return `${spec.diagramId}-edge-${edgeId}`;
}

export function groupElementId(spec: GraphDiagramSpec, groupId: string): string {
  return `${spec.diagramId}-group-${groupId}`;
}

function titleElement(spec: GraphDiagramSpec): SkeletonText {
  const elementId = `${spec.diagramId}-title`;
  return {
    type: "text",
    id: elementId,
    x: 0,
    y: 0,
    text: spec.title,
    fontSize: TITLE_FONT_SIZE,
    strokeColor: PLAIN_STROKE,
    strokeWidth: PLAIN_STROKE_WIDTH,
    seed: seedFromElementId(elementId),
    groupIds: [],
  };
}

function groupElements(
  spec: GraphDiagramSpec,
  layout: GraphDiagramLayout,
): readonly ExcalidrawElementSkeleton[] {
  const placedByGroupId = new Map(layout.groups.map((group) => [group.groupId, group]));

  return spec.groups.flatMap((group) => {
    const placed = placedByGroupId.get(group.groupId);
    if (placed === undefined) {
      return [];
    }
    const elementId = groupElementId(spec, group.groupId);
    const box: SkeletonShape = {
      type: "rectangle",
      id: elementId,
      x: placed.x,
      y: placed.y,
      width: placed.width,
      height: placed.height,
      strokeColor: GROUP_STROKE,
      backgroundColor: GROUP_FILL,
      fillStyle: "solid",
      strokeWidth: PLAIN_STROKE_WIDTH,
      roughness: ARCHITECT_ROUGHNESS,
      seed: seedFromElementId(elementId),
      groupIds: [selectionGroupIdFor(spec, group.groupId)],
      label: null,
    };
    // The group's name is a free text element above the box rather than a bound
    // label, because a bound label is centred inside the shape and would sit on
    // top of the members.
    const nameElementId = `${elementId}-name`;
    const name: SkeletonText = {
      type: "text",
      id: nameElementId,
      x: placed.x + 8,
      y: placed.y + 6,
      text: group.label,
      fontSize: GROUP_FONT_SIZE,
      strokeColor: GROUP_STROKE,
      strokeWidth: PLAIN_STROKE_WIDTH,
      seed: seedFromElementId(nameElementId),
      groupIds: [selectionGroupIdFor(spec, group.groupId)],
    };
    return [box, name];
  });
}

function nodeElements(
  spec: GraphDiagramSpec,
  layout: GraphDiagramLayout,
): readonly ExcalidrawElementSkeleton[] {
  const placedByNodeId = new Map(layout.nodes.map((node) => [node.nodeId, node]));
  const groupIdByNodeId = new Map<string, string>();
  for (const group of spec.groups) {
    for (const nodeId of group.memberNodeIds) {
      groupIdByNodeId.set(nodeId, group.groupId);
    }
  }

  return spec.nodes.flatMap((node) => {
    const placed = placedByNodeId.get(node.nodeId);
    if (placed === undefined) {
      return [];
    }
    const emphasized = isEmphasizedNode(spec, node.nodeId);
    const groupId = groupIdByNodeId.get(node.nodeId);
    const elementId = nodeElementId(spec, node.nodeId);

    const shape: SkeletonShape = {
      type: excalidrawShapeFor(node.shape),
      id: elementId,
      ...cornerAndSize(placed),
      strokeColor: emphasized ? EMPHASIZED_STROKE : PLAIN_STROKE,
      backgroundColor: emphasized ? EMPHASIZED_FILL : PLAIN_FILL,
      fillStyle: "solid",
      strokeWidth: emphasized ? EMPHASIZED_STROKE_WIDTH : PLAIN_STROKE_WIDTH,
      roughness: ARCHITECT_ROUGHNESS,
      seed: seedFromElementId(elementId),
      groupIds: groupId === undefined ? [] : [selectionGroupIdFor(spec, groupId)],
      label: boundLabel(node.label, NODE_FONT_SIZE, emphasized),
    };
    return [shape];
  });
}

function edgeElements(spec: GraphDiagramSpec): readonly SkeletonArrow[] {
  return spec.edges.map((edge) => {
    const emphasized = isEmphasizedEdge(spec, edge.edgeId);
    const elementId = edgeElementId(spec, edge.edgeId);

    return {
      type: "arrow",
      id: elementId,
      // A bound arrow is routed by Excalidraw between the two shapes it names, so
      // these are a starting point it immediately recalculates, not a route.
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      strokeColor: emphasized ? EMPHASIZED_STROKE : PLAIN_STROKE,
      strokeWidth: emphasized ? EMPHASIZED_STROKE_WIDTH : PLAIN_STROKE_WIDTH,
      seed: seedFromElementId(elementId),
      groupIds: [],
      start: { id: nodeElementId(spec, edge.fromNodeId) },
      end: { id: nodeElementId(spec, edge.toNodeId) },
      startArrowhead: null,
      endArrowhead: arrowheadFor(edge.kind),
      label:
        edge.label === null ? null : boundLabel(edge.label, EDGE_FONT_SIZE, emphasized),
    };
  });
}

/** One explicit branch per kind, so a new edge kind cannot inherit another's look. */
function arrowheadFor(kind: GraphDiagramSpec["edges"][number]["kind"]): "arrow" | null {
  switch (kind) {
    case "directed":
      return "arrow";
    case "undirected":
      return null;
  }
}

/** One explicit branch per shape, so a new node shape must state what it draws as. */
function excalidrawShapeFor(shape: NodeShape): SkeletonShapeType {
  switch (shape) {
    case "step":
      return "rectangle";
    case "endpoint":
      return "ellipse";
    case "decision":
      return "diamond";
  }
}

function boundLabel(text: string, fontSize: number, emphasized: boolean): SkeletonBoundLabel {
  return {
    text,
    fontSize,
    strokeColor: emphasized ? EMPHASIZED_STROKE : PLAIN_STROKE,
  };
}

function cornerAndSize(placed: PlacedNode): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
} {
  return { x: placed.x, y: placed.y, width: placed.width, height: placed.height };
}

/**
 * Excalidraw treats elements sharing a `groupIds` entry as one thing to select and
 * drag. A spec group becomes exactly that, so the learner moves a group as a unit.
 */
function selectionGroupIdFor(spec: GraphDiagramSpec, groupId: string): string {
  return groupElementId(spec, groupId);
}
