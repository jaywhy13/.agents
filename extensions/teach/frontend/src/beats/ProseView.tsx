import { Fragment, useMemo } from "react";

import { glossaryTermNames } from "../../../shared/glossary.ts";
import { splitProseByTerms } from "../../../shared/term-highlighting.ts";
import { useGlossary } from "../glossary-context.ts";

/**
 * Prose with every glossary term marked, so the learner can see which words they
 * have already been given a meaning for. Code is never passed through this.
 */
export function ProseView({ text }: { text: string }) {
  const glossary = useGlossary();
  const meaningByTerm = useMemo(() => {
    const meanings = new Map<string, string>();
    for (const entry of glossary) {
      meanings.set(entry.term, entry.plainLanguageMeaning);
      if (entry.fullForm !== null) {
        meanings.set(entry.fullForm, entry.plainLanguageMeaning);
      }
    }
    return meanings;
  }, [glossary]);

  const segments = useMemo(
    () => splitProseByTerms(text, glossaryTermNames(glossary)),
    [text, glossary],
  );

  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === "term" ? (
          <span
            key={index}
            className="glossary-term"
            title={meaningByTerm.get(segment.term ?? "") ?? ""}
          >
            {segment.text}
          </span>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}
