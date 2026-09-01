/**
 * What a lesson is allowed to draw as a graph.
 *
 * A graph diagram is boxes joined by lines: the shape most teaching diagrams take.
 * The lesson describes the meaning — these things, joined this way, these ones
 * matter most — and never the drawing. Position, size and colour are worked out by
 * the compiler, so the same spec always yields the same picture.
 *
 * Every limit here exists so a diagram stays readable at one glance. A diagram with
 * forty boxes is not a teaching diagram, so it is refused rather than drawn badly.
 *
 * This module is pure: no node built-ins, so the lesson page can use it too.
 */

import {
  asDiagramRecord,
  InvalidGraphDiagramError,
  optionalCountingNumber,
  optionalLabel,
  optionalMemberOf,
  requireIdentifier,
  requireIdentifierList,
  requireLabel,
  requireListWithinLimit,
  requireMemberOf,
} from "./diagram-spec-fields.ts";

export { InvalidGraphDiagramError } from "./diagram-spec-fields.ts";

/** Which way the arrows read. Everything else about the drawing follows from this. */
export const DIAGRAM_DIRECTIONS = ["left_to_right", "top_to_bottom"] as const;

export type DiagramDirection = (typeof DIAGRAM_DIRECTIONS)[number];

/**
 * Three shapes, each with a settled meaning: a step is a rectangle, a start or end
 * point is an ellipse, a decision is a diamond. Offering more shapes would invite
 * decoration without adding meaning.
 */
export const NODE_SHAPES = ["step", "endpoint", "decision"] as const;

export type NodeShape = (typeof NODE_SHAPES)[number];

/** A directed edge says "this then that". An undirected edge says "these two relate". */
export const EDGE_KINDS = ["directed", "undirected"] as const;

export type EdgeKind = (typeof EDGE_KINDS)[number];

export const FEWEST_NODES = 1;
export const MOST_NODES = 24;
export const MOST_EDGES = 48;
export const MOST_GROUPS = 6;
/** Emphasising most of a diagram emphasises nothing, so the count is capped low. */
export const MOST_EMPHASIZED_PARTS = 8;

/**
 * A diagram may be drawn again with more on it as the lesson goes on. Each drawing
 * of it is a revision, counting from one. Twenty is far more than a lesson could
 * usefully show, and having a ceiling keeps the revision from being used as a
 * counter for something else.
 */
export const FIRST_DIAGRAM_REVISION = 1;
export const MOST_DIAGRAM_REVISIONS = 20;

export const LONGEST_TITLE_CHARACTERS = 80;
export const LONGEST_NODE_LABEL_CHARACTERS = 60;
export const LONGEST_EDGE_LABEL_CHARACTERS = 40;
export const LONGEST_GROUP_LABEL_CHARACTERS = 60;

export interface GraphDiagramNode {
  readonly nodeId: string;
  readonly label: string;
  readonly shape: NodeShape;
}

export interface GraphDiagramEdge {
  readonly edgeId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly kind: EdgeKind;
  /** What the join means, when the join is not obvious from the two labels. */
  readonly label: string | null;
}

/** A named box drawn around nodes that belong together. */
export interface GraphDiagramGroup {
  readonly groupId: string;
  readonly label: string;
  readonly memberNodeIds: readonly string[];
}

/** The parts of the diagram this beat is actually about. */
export interface GraphDiagramEmphasis {
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
}

export interface GraphDiagramSpec {
  readonly diagramId: string;
  /**
   * Which drawing of this diagram this is.
   *
   * A lesson teaches a diagram in stages: three boxes first, then the same three
   * with two more and the joins between them. Those are the same diagram, so they
   * share a `diagramId`, and they are not the same drawing, so each has its own
   * revision. The learner's edits are kept per revision, which is what lets a new
   * revision be shown as it was taught while the edits to the last one survive.
   */
  readonly revision: number;
  readonly title: string;
  readonly direction: DiagramDirection;
  readonly nodes: readonly GraphDiagramNode[];
  readonly edges: readonly GraphDiagramEdge[];
  readonly groups: readonly GraphDiagramGroup[];
  readonly emphasis: GraphDiagramEmphasis;
}

export function parseGraphDiagramSpec(candidate: unknown): GraphDiagramSpec {
  const record = asDiagramRecord(candidate, "graph diagram spec");

  const nodes = parseNodes(record["nodes"]);
  const knownNodeIds = new Set(nodes.map((node) => node.nodeId));
  const edges = parseEdges(record["edges"], knownNodeIds);
  const knownEdgeIds = new Set(edges.map((edge) => edge.edgeId));

  return {
    diagramId: requireIdentifier(record["diagramId"], "diagramId"),
    revision: optionalCountingNumber(
      record["revision"],
      "revision",
      FIRST_DIAGRAM_REVISION,
      MOST_DIAGRAM_REVISIONS,
    ),
    title: requireLabel(record["title"], "title", LONGEST_TITLE_CHARACTERS),
    direction: optionalMemberOf(
      record["direction"],
      "direction",
      DIAGRAM_DIRECTIONS,
      "left_to_right",
    ),
    nodes,
    edges,
    groups: parseGroups(record["groups"], knownNodeIds),
    emphasis: parseEmphasis(record["emphasis"], knownNodeIds, knownEdgeIds),
  };
}

/**
 * The nodes keyed by id, in declaration order. Callers that draw or describe the
 * diagram all need this, and deriving it here keeps the derivation in one place.
 */
export function nodesByIdIn(spec: GraphDiagramSpec): ReadonlyMap<string, GraphDiagramNode> {
  return new Map(spec.nodes.map((node) => [node.nodeId, node]));
}

/**
 * The group each node belongs to, or nothing when it stands alone. A node belongs
 * to at most one group, which is enforced when the spec is parsed.
 */
export function groupByNodeIdIn(spec: GraphDiagramSpec): ReadonlyMap<string, GraphDiagramGroup> {
  const groupByNodeId = new Map<string, GraphDiagramGroup>();
  for (const group of spec.groups) {
    for (const nodeId of group.memberNodeIds) {
      groupByNodeId.set(nodeId, group);
    }
  }
  return groupByNodeId;
}

export function isEmphasizedNode(spec: GraphDiagramSpec, nodeId: string): boolean {
  return spec.emphasis.nodeIds.includes(nodeId);
}

export function isEmphasizedEdge(spec: GraphDiagramSpec, edgeId: string): boolean {
  return spec.emphasis.edgeIds.includes(edgeId);
}

function parseNodes(candidate: unknown): readonly GraphDiagramNode[] {
  const entries = requireListWithinLimit(candidate, "nodes", FEWEST_NODES, MOST_NODES);

  const nodes: GraphDiagramNode[] = [];
  const seenNodeIds = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const record = asDiagramRecord(entry, `nodes[${index}]`);
    const nodeId = requireIdentifier(record["nodeId"], `nodes[${index}].nodeId`);
    if (seenNodeIds.has(nodeId)) {
      throw new InvalidGraphDiagramError(`Field nodes[${index}].nodeId repeats "${nodeId}".`);
    }
    seenNodeIds.add(nodeId);

    nodes.push({
      nodeId,
      label: requireLabel(record["label"], `nodes[${index}].label`, LONGEST_NODE_LABEL_CHARACTERS),
      shape: optionalMemberOf(record["shape"], `nodes[${index}].shape`, NODE_SHAPES, "step"),
    });
  }
  return nodes;
}

function parseEdges(
  candidate: unknown,
  knownNodeIds: ReadonlySet<string>,
): readonly GraphDiagramEdge[] {
  const entries = requireListWithinLimit(candidate, "edges", 0, MOST_EDGES);

  const edges: GraphDiagramEdge[] = [];
  const seenEdgeIds = new Set<string>();
  const seenJoins = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const record = asDiagramRecord(entry, `edges[${index}]`);
    const edgeId = requireIdentifier(record["edgeId"], `edges[${index}].edgeId`);
    if (seenEdgeIds.has(edgeId)) {
      throw new InvalidGraphDiagramError(`Field edges[${index}].edgeId repeats "${edgeId}".`);
    }
    seenEdgeIds.add(edgeId);

    const fromNodeId = requireKnownNodeId(
      record["fromNodeId"],
      `edges[${index}].fromNodeId`,
      knownNodeIds,
    );
    const toNodeId = requireKnownNodeId(
      record["toNodeId"],
      `edges[${index}].toNodeId`,
      knownNodeIds,
    );
    if (fromNodeId === toNodeId) {
      throw new InvalidGraphDiagramError(
        `Field edges[${index}] joins "${fromNodeId}" to itself. A loop back to the same box teaches nothing a label cannot say.`,
      );
    }

    const kind = optionalMemberOf(record["kind"], `edges[${index}].kind`, EDGE_KINDS, "directed");
    const join = describeJoin(fromNodeId, toNodeId, kind);
    if (seenJoins.has(join)) {
      throw new InvalidGraphDiagramError(
        `Field edges[${index}] draws a second line from "${fromNodeId}" to "${toNodeId}". Say both meanings in one label.`,
      );
    }
    seenJoins.add(join);

    edges.push({
      edgeId,
      fromNodeId,
      toNodeId,
      kind,
      label: optionalLabel(
        record["label"],
        `edges[${index}].label`,
        LONGEST_EDGE_LABEL_CHARACTERS,
      ),
    });
  }
  return edges;
}

function parseGroups(
  candidate: unknown,
  knownNodeIds: ReadonlySet<string>,
): readonly GraphDiagramGroup[] {
  const entries = requireListWithinLimit(candidate, "groups", 0, MOST_GROUPS);

  const groups: GraphDiagramGroup[] = [];
  const seenGroupIds = new Set<string>();
  const groupIdByNodeId = new Map<string, string>();
  for (const [index, entry] of entries.entries()) {
    const record = asDiagramRecord(entry, `groups[${index}]`);
    const groupId = requireIdentifier(record["groupId"], `groups[${index}].groupId`);
    if (seenGroupIds.has(groupId)) {
      throw new InvalidGraphDiagramError(`Field groups[${index}].groupId repeats "${groupId}".`);
    }
    seenGroupIds.add(groupId);

    const memberNodeIds = requireIdentifierList(
      record["memberNodeIds"],
      `groups[${index}].memberNodeIds`,
      1,
      MOST_NODES,
    );
    for (const [memberIndex, nodeId] of memberNodeIds.entries()) {
      if (!knownNodeIds.has(nodeId)) {
        throw new InvalidGraphDiagramError(
          `Field groups[${index}].memberNodeIds[${memberIndex}] names "${nodeId}", which is not a node.`,
        );
      }
      const alreadyIn = groupIdByNodeId.get(nodeId);
      if (alreadyIn !== undefined) {
        throw new InvalidGraphDiagramError(
          `Node "${nodeId}" is in group "${alreadyIn}" and group "${groupId}". A node belongs to one group.`,
        );
      }
      groupIdByNodeId.set(nodeId, groupId);
    }

    groups.push({
      groupId,
      label: requireLabel(
        record["label"],
        `groups[${index}].label`,
        LONGEST_GROUP_LABEL_CHARACTERS,
      ),
      memberNodeIds,
    });
  }
  return groups;
}

function parseEmphasis(
  candidate: unknown,
  knownNodeIds: ReadonlySet<string>,
  knownEdgeIds: ReadonlySet<string>,
): GraphDiagramEmphasis {
  if (candidate === undefined || candidate === null) {
    return { nodeIds: [], edgeIds: [] };
  }

  const record = asDiagramRecord(candidate, "emphasis");
  const nodeIds = requireIdentifierList(
    record["nodeIds"],
    "emphasis.nodeIds",
    0,
    MOST_EMPHASIZED_PARTS,
  );
  const edgeIds = requireIdentifierList(
    record["edgeIds"],
    "emphasis.edgeIds",
    0,
    MOST_EMPHASIZED_PARTS,
  );

  requireEveryIdIsKnown(nodeIds, "emphasis.nodeIds", knownNodeIds, "node");
  requireEveryIdIsKnown(edgeIds, "emphasis.edgeIds", knownEdgeIds, "edge");

  if (nodeIds.length + edgeIds.length > MOST_EMPHASIZED_PARTS) {
    throw new InvalidGraphDiagramError(
      `Field emphasis may mark at most ${MOST_EMPHASIZED_PARTS} parts in total. Emphasising more than that emphasises nothing.`,
    );
  }

  return { nodeIds, edgeIds };
}

function requireEveryIdIsKnown(
  ids: readonly string[],
  fieldName: string,
  knownIds: ReadonlySet<string>,
  partLabel: string,
): void {
  const seen = new Set<string>();
  for (const [index, id] of ids.entries()) {
    if (!knownIds.has(id)) {
      throw new InvalidGraphDiagramError(
        `Field ${fieldName}[${index}] names "${id}", which is not a ${partLabel}.`,
      );
    }
    if (seen.has(id)) {
      throw new InvalidGraphDiagramError(`Field ${fieldName} repeats "${id}".`);
    }
    seen.add(id);
  }
}

function requireKnownNodeId(
  value: unknown,
  fieldName: string,
  knownNodeIds: ReadonlySet<string>,
): string {
  const nodeId = requireIdentifier(value, fieldName);
  if (!knownNodeIds.has(nodeId)) {
    throw new InvalidGraphDiagramError(
      `Field ${fieldName} names "${nodeId}", which is not a node. List every node before the edges that join them.`,
    );
  }
  return nodeId;
}

/**
 * An undirected join is the same join whichever end is written first, so its two
 * ends are sorted before they are compared. A directed join is not.
 */
function describeJoin(fromNodeId: string, toNodeId: string, kind: EdgeKind): string {
  switch (kind) {
    case "directed":
      return `directed:${fromNodeId}->${toNodeId}`;
    case "undirected":
      return `undirected:${[fromNodeId, toNodeId].sort().join("-")}`;
  }
}
