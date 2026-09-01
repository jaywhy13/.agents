import type { GraphDiagramSpec } from "../../../shared/visuals/graph-diagram-spec.ts";
import { parseGraphDiagramSpec } from "../../../shared/visuals/graph-diagram-spec.ts";

/**
 * Builds a spec that is valid in every field, so a test can change exactly the one
 * field it is about and let the rest be uninteresting.
 */
export function graphDiagramSpecInput(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    diagramId: "queue-basics",
    title: "How a message queue moves work",
    direction: "left_to_right",
    nodes: [
      { nodeId: "producer", label: "Producer", shape: "endpoint" },
      { nodeId: "queue", label: "Queue", shape: "step" },
      { nodeId: "consumer", label: "Consumer", shape: "endpoint" },
    ],
    edges: [
      { edgeId: "put", fromNodeId: "producer", toNodeId: "queue", kind: "directed", label: "puts work on" },
      { edgeId: "take", fromNodeId: "queue", toNodeId: "consumer", kind: "directed" },
    ],
    groups: [],
    emphasis: { nodeIds: ["queue"], edgeIds: [] },
    ...overrides,
  };
}

export function graphDiagramSpec(overrides: Record<string, unknown> = {}): GraphDiagramSpec {
  return parseGraphDiagramSpec(graphDiagramSpecInput(overrides));
}
