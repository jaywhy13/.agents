/**
 * Where each box goes.
 *
 * Layout is separated from drawing so it can be reasoned about on its own: this
 * module answers "which column, which row, which box surrounds which", and knows
 * nothing about colours, arrowheads or Excalidraw.
 *
 * The rule is longest-path ranking. A node sits one rank after the furthest node
 * that points at it, so every arrow points forwards and the reader's eye moves one
 * way. Undirected edges say two things relate, not that one follows the other, so
 * they do not affect rank.
 *
 * A diagram that loops back on itself has no longest path. Rather than refuse it,
 * ranking relaxes a fixed number of times and then stops, which settles on one
 * arrangement rather than looping forever. It is deterministic either way.
 *
 * This module is pure: no node built-ins, so the lesson page can use it too.
 */

import type { GraphDiagramSpec } from "./graph-diagram-spec.ts";
import { groupByNodeIdIn } from "./graph-diagram-spec.ts";

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 80;
/** The gap between one rank and the next, wide enough for an edge label. */
export const RANK_GAP = 140;
/** The gap between two nodes in the same rank. */
export const LANE_GAP = 48;
export const GROUP_PADDING = 24;
/** Room above a group's members for the group's own name. */
export const GROUP_LABEL_HEIGHT = 32;
export const TITLE_HEIGHT = 56;

export interface PlacedNode {
  readonly nodeId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rank: number;
  readonly positionInRank: number;
}

export interface PlacedGroup {
  readonly groupId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface GraphDiagramLayout {
  readonly nodes: readonly PlacedNode[];
  readonly groups: readonly PlacedGroup[];
  readonly width: number;
  readonly height: number;
}

export function layOutGraphDiagram(spec: GraphDiagramSpec): GraphDiagramLayout {
  const rankByNodeId = rankNodes(spec);
  const nodes = placeNodes(spec, rankByNodeId);
  const groups = boxGroups(spec, nodes);

  return {
    nodes,
    groups,
    width: farthestEdge(nodes, groups, "horizontal"),
    height: farthestEdge(nodes, groups, "vertical"),
  };
}

/**
 * Relaxes every directed edge until no rank moves, or until each node has had a
 * chance to be pushed once per node in the graph. The bound is what makes a graph
 * with a loop in it terminate.
 */
function rankNodes(spec: GraphDiagramSpec): ReadonlyMap<string, number> {
  const rankByNodeId = new Map(spec.nodes.map((node) => [node.nodeId, 0]));
  const directedEdges = spec.edges.filter((edge) => edge.kind === "directed");
  const highestPossibleRank = Math.max(spec.nodes.length - 1, 0);

  for (let pass = 0; pass < spec.nodes.length; pass += 1) {
    let anyRankMoved = false;
    for (const edge of directedEdges) {
      const rankOfSource = rankByNodeId.get(edge.fromNodeId) ?? 0;
      const rankOfTarget = rankByNodeId.get(edge.toNodeId) ?? 0;
      const wantedRank = Math.min(rankOfSource + 1, highestPossibleRank);
      if (rankOfTarget < wantedRank) {
        rankByNodeId.set(edge.toNodeId, wantedRank);
        anyRankMoved = true;
      }
    }
    if (!anyRankMoved) {
      break;
    }
  }

  return rankByNodeId;
}

function placeNodes(
  spec: GraphDiagramSpec,
  rankByNodeId: ReadonlyMap<string, number>,
): readonly PlacedNode[] {
  const groupByNodeId = groupByNodeIdIn(spec);
  const groupOrderByGroupId = new Map(spec.groups.map((group, index) => [group.groupId, index]));
  const ungroupedOrder = spec.groups.length;

  const declarationOrderByNodeId = new Map(
    spec.nodes.map((node, index) => [node.nodeId, index] as const),
  );

  const nodeIdsByRank = new Map<number, string[]>();
  for (const node of spec.nodes) {
    const rank = rankByNodeId.get(node.nodeId) ?? 0;
    const nodeIdsInRank = nodeIdsByRank.get(rank) ?? [];
    nodeIdsInRank.push(node.nodeId);
    nodeIdsByRank.set(rank, nodeIdsInRank);
  }

  const placedByNodeId = new Map<string, PlacedNode>();
  for (const [rank, nodeIdsInRank] of nodeIdsByRank) {
    // Nodes in the same group are kept next to each other, so a group's box stays
    // a tight rectangle instead of stretching across unrelated nodes.
    const orderedNodeIds = [...nodeIdsInRank].sort((left, right) => {
      const leftGroupOrder = groupOrderByGroupId.get(groupByNodeId.get(left)?.groupId ?? "");
      const rightGroupOrder = groupOrderByGroupId.get(groupByNodeId.get(right)?.groupId ?? "");
      const byGroup = (leftGroupOrder ?? ungroupedOrder) - (rightGroupOrder ?? ungroupedOrder);
      if (byGroup !== 0) {
        return byGroup;
      }
      return (
        (declarationOrderByNodeId.get(left) ?? 0) - (declarationOrderByNodeId.get(right) ?? 0)
      );
    });

    for (const [positionInRank, nodeId] of orderedNodeIds.entries()) {
      placedByNodeId.set(nodeId, {
        nodeId,
        ...cornerOf(spec.direction, rank, positionInRank),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        rank,
        positionInRank,
      });
    }
  }

  // Declaration order is kept in the output so the compiled element list is stable
  // and reads in the order the lesson wrote the nodes.
  return spec.nodes.map((node) => requirePlaced(placedByNodeId, node.nodeId));
}

function cornerOf(
  direction: GraphDiagramSpec["direction"],
  rank: number,
  positionInRank: number,
): { readonly x: number; readonly y: number } {
  const alongTheReadingDirection = rank * (NODE_WIDTH + RANK_GAP);
  const acrossTheReadingDirection = positionInRank * (NODE_HEIGHT + LANE_GAP);

  switch (direction) {
    case "left_to_right":
      return { x: alongTheReadingDirection, y: TITLE_HEIGHT + acrossTheReadingDirection };
    case "top_to_bottom":
      return {
        x: positionInRank * (NODE_WIDTH + LANE_GAP),
        y: TITLE_HEIGHT + rank * (NODE_HEIGHT + RANK_GAP),
      };
  }
}

function boxGroups(
  spec: GraphDiagramSpec,
  nodes: readonly PlacedNode[],
): readonly PlacedGroup[] {
  const placedByNodeId = new Map(nodes.map((node) => [node.nodeId, node]));

  return spec.groups.map((group) => {
    const members = group.memberNodeIds.map((nodeId) => requirePlaced(placedByNodeId, nodeId));
    const left = Math.min(...members.map((member) => member.x));
    const top = Math.min(...members.map((member) => member.y));
    const right = Math.max(...members.map((member) => member.x + member.width));
    const bottom = Math.max(...members.map((member) => member.y + member.height));

    return {
      groupId: group.groupId,
      x: left - GROUP_PADDING,
      y: top - GROUP_PADDING - GROUP_LABEL_HEIGHT,
      width: right - left + GROUP_PADDING * 2,
      height: bottom - top + GROUP_PADDING * 2 + GROUP_LABEL_HEIGHT,
    };
  });
}

function farthestEdge(
  nodes: readonly PlacedNode[],
  groups: readonly PlacedGroup[],
  axis: "horizontal" | "vertical",
): number {
  const nodeEdges = nodes.map((node) =>
    axis === "horizontal" ? node.x + node.width : node.y + node.height,
  );
  const groupEdges = groups.map((group) =>
    axis === "horizontal" ? group.x + group.width : group.y + group.height,
  );
  return Math.max(0, ...nodeEdges, ...groupEdges);
}

function requirePlaced(placedByNodeId: ReadonlyMap<string, PlacedNode>, nodeId: string): PlacedNode {
  const placed = placedByNodeId.get(nodeId);
  if (placed === undefined) {
    // Unreachable: the spec parser refuses any id that is not a node.
    throw new Error(`Node "${nodeId}" was never placed.`);
  }
  return placed;
}
