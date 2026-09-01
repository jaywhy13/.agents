import type { DefinitionBeat } from "../../../shared/beat.ts";
import { ProseView } from "./ProseView.tsx";

export function DefinitionView({ beat }: { beat: DefinitionBeat }) {
  return (
    <article className="beat-card definition-card">
      <p className="beat-kind-label">Definition</p>
      <h2 className="definition-term">
        {beat.term}
        {beat.fullForm === null ? null : (
          <span className="definition-full-form">{beat.fullForm}</span>
        )}
      </h2>
      <p className="definition-meaning">
        <ProseView text={beat.plainLanguageMeaning} />
      </p>
      {beat.example === null ? null : (
        <p className="definition-example">
          <span className="definition-example-label">For example</span>
          <ProseView text={beat.example} />
        </p>
      )}
    </article>
  );
}
