import type { DiagramOutline } from "../../../shared/visuals/diagram-outline.ts";

/**
 * The diagram as a list a person can read.
 *
 * This is shown beside the drawing, not instead of it, so a learner using a screen
 * reader gets the same content as a learner looking at boxes. It is also what the
 * workspace falls back to when no diagram editor is available.
 */
export function DiagramOutlineView({ outline }: { outline: DiagramOutline }) {
  return (
    <section className="diagram-outline" aria-label={`${outline.title}, described in words`}>
      <h3 className="diagram-outline-title">{outline.title}</h3>

      <h4 className="diagram-outline-heading">Parts</h4>
      <ul className="diagram-outline-list">
        {outline.nodes.map((node) => (
          <li
            key={node.nodeId}
            className={node.isEmphasized ? "diagram-outline-emphasized" : undefined}
          >
            {node.label}
            {node.groupLabel === null ? null : (
              <span className="diagram-outline-group"> — in {node.groupLabel}</span>
            )}
          </li>
        ))}
      </ul>

      {outline.joins.length === 0 ? null : (
        <>
          <h4 className="diagram-outline-heading">How they join</h4>
          <ul className="diagram-outline-list">
            {outline.joins.map((join) => (
              <li
                key={join.edgeId}
                className={join.isEmphasized ? "diagram-outline-emphasized" : undefined}
              >
                {join.sentence}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
