import type { GlossaryEntry } from "../../shared/glossary.ts";

/**
 * Every term the lesson has defined, in one place the learner can go back to. It
 * is derived from the definition beats, so it can never drift from what was taught.
 */
export function GlossaryPanel({ entries }: { readonly entries: readonly GlossaryEntry[] }) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <aside className="glossary-panel">
      <h2 className="glossary-heading">Words you have been given</h2>
      <dl className="glossary-list">
        {entries.map((entry) => (
          <div key={entry.beatId} className="glossary-entry">
            <dt className="glossary-entry-term">
              {entry.term}
              {entry.fullForm === null ? null : (
                <span className="glossary-entry-full-form">{entry.fullForm}</span>
              )}
            </dt>
            <dd className="glossary-entry-meaning">{entry.plainLanguageMeaning}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
