/**
 * The diagram said in words.
 *
 * A drawing that only exists as pixels is unreadable to a screen reader, invisible
 * to a text search, and gone entirely if the editor fails to load. Every compiled
 * diagram therefore also has an outline: the same nodes and joins, as sentences.
 *
 * The page shows the outline beside the drawing, and shows it on its own when the
 * editor is not available. It is derived from the spec, so it can never describe a
 * diagram other than the one that was drawn.
 *
 * This module is pure: no node built-ins, so the lesson page can use it too.
 */

import type { GraphDiagramSpec } from "./graph-diagram-spec.ts";
import { groupByNodeIdIn, nodesByIdIn } from "./graph-diagram-spec.ts";

export interface OutlineNode {
  readonly nodeId: string;
  readonly label: string;
  readonly groupLabel: string | null;
  readonly isEmphasized: boolean;
}

export interface OutlineJoin {
  readonly edgeId: string;
  /** One sentence, such as `Broker sends to Consumer (after the retry)`. */
  readonly sentence: string;
  readonly isEmphasized: boolean;
}

export interface DiagramOutline {
  readonly title: string;
  readonly nodes: readonly OutlineNode[];
  readonly joins: readonly OutlineJoin[];
}

export function describeDiagramForReading(spec: GraphDiagramSpec): DiagramOutline {
  const nodesById = nodesByIdIn(spec);
  const groupByNodeId = groupByNodeIdIn(spec);

  return {
    title: spec.title,
    nodes: spec.nodes.map((node) => ({
      nodeId: node.nodeId,
      label: node.label,
      groupLabel: groupByNodeId.get(node.nodeId)?.label ?? null,
      isEmphasized: spec.emphasis.nodeIds.includes(node.nodeId),
    })),
    joins: spec.edges.map((edge) => {
      const fromLabel = nodesById.get(edge.fromNodeId)?.label ?? edge.fromNodeId;
      const toLabel = nodesById.get(edge.toNodeId)?.label ?? edge.toNodeId;
      return {
        edgeId: edge.edgeId,
        sentence: joinSentence(fromLabel, toLabel, edge.kind, edge.label),
        isEmphasized: spec.emphasis.edgeIds.includes(edge.edgeId),
      };
    }),
  };
}

/** One explicit branch per kind, so a new edge kind must say how it reads aloud. */
function joinSentence(
  fromLabel: string,
  toLabel: string,
  kind: GraphDiagramSpec["edges"][number]["kind"],
  edgeLabel: string | null,
): string {
  const note = edgeLabel === null ? "" : ` (${edgeLabel})`;

  switch (kind) {
    case "directed":
      return `${fromLabel} leads to ${toLabel}${note}`;
    case "undirected":
      return `${fromLabel} relates to ${toLabel}${note}`;
  }
}
