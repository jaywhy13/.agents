import type { LessonEndBeat } from "../../../shared/beat.ts";
import { ProseView } from "./ProseView.tsx";

export function LessonEndView({ beat }: { beat: LessonEndBeat }) {
  return (
    <article className="beat-card lesson-end-card">
      <p className="beat-kind-label">End of the lesson</p>
      <p className="lesson-end-recap">
        <ProseView text={beat.recap} />
      </p>

      {beat.masteredConcepts.length === 0 ? null : (
        <section className="lesson-end-section">
          <h3 className="lesson-end-heading">What you now have</h3>
          <ul>
            {beat.masteredConcepts.map((concept, index) => (
              <li key={`${beat.beatId}-mastered-${index}`}>
                <ProseView text={concept} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {beat.suggestedNextTopics.length === 0 ? null : (
        <section className="lesson-end-section">
          <h3 className="lesson-end-heading">What could come next</h3>
          <ul>
            {beat.suggestedNextTopics.map((topic, index) => (
              <li key={`${beat.beatId}-next-${index}`}>{topic}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
