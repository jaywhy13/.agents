import type { ConceptCardBeat } from "../../../shared/beat.ts";
import { ProseView } from "./ProseView.tsx";

export function ConceptCardView({ beat }: { beat: ConceptCardBeat }) {
  return (
    <article className="beat-card concept-card">
      <p className="concept-card-number">Concept {beat.sequenceNumber}</p>
      <h2 className="concept-card-title">{beat.title}</h2>
      <p className="concept-card-summary">
        <ProseView text={beat.plainLanguageSummary} />
      </p>
      <ul className="concept-card-points">
        {beat.keyPoints.map((keyPoint, index) => (
          <li key={`${beat.beatId}-point-${index}`}>
            <ProseView text={keyPoint} />
          </li>
        ))}
      </ul>
      {beat.pauseForLearner ? (
        <p className="concept-card-pause">
          Take your time. Press <span className="hotkey">Space</span> to ask something, or continue
          when you are ready.
        </p>
      ) : null}
    </article>
  );
}
