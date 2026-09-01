import { useMemo, useState } from "react";

import type { CodeBeat } from "../../../shared/beat.ts";
import { ProseView } from "./ProseView.tsx";
import { highlightedCodeLines } from "./code-highlighting.ts";

type CopyOutcome = "not_copied_yet" | "copied" | "could_not_copy";

export function CodeView({ beat }: { beat: CodeBeat }) {
  const lines = useMemo(() => highlightedCodeLines(beat), [beat]);
  const [copyOutcome, setCopyOutcome] = useState<CopyOutcome>("not_copied_yet");

  async function copyCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(beat.code);
      setCopyOutcome("copied");
    } catch {
      // Copying is a convenience. The code is on screen either way, so the page
      // says the copy did not work rather than failing the beat.
      setCopyOutcome("could_not_copy");
    }
  }

  return (
    <article className="beat-card code-card">
      <div className="code-card-header">
        <span className="beat-kind-label">{beat.fileName ?? beat.language}</span>
        <button
          type="button"
          className="button code-copy-button"
          onClick={() => {
            void copyCode();
          }}
        >
          {copyButtonLabel(copyOutcome)}
        </button>
      </div>

      <pre className="code-block">
        <code>
          {lines.map((line) => (
            <span
              key={`${beat.beatId}-line-${line.lineNumber}`}
              className={line.isEmphasized ? "code-line code-line-emphasized" : "code-line"}
            >
              <span className="code-line-number">{line.lineNumber}</span>
              <span className="code-line-text">
                {line.spans.map((span, index) => (
                  <span
                    key={`${beat.beatId}-line-${line.lineNumber}-span-${index}`}
                    className={span.tokenType === null ? undefined : `token ${span.tokenType}`}
                  >
                    {span.text}
                  </span>
                ))}
              </span>
            </span>
          ))}
        </code>
      </pre>

      <p className="code-explanation">
        <ProseView text={beat.explanation} />
      </p>
    </article>
  );
}

/** One explicit branch per outcome, so a new outcome cannot reuse another's label. */
function copyButtonLabel(copyOutcome: CopyOutcome): string {
  switch (copyOutcome) {
    case "not_copied_yet":
      return "Copy";
    case "copied":
      return "Copied";
    case "could_not_copy":
      return "Could not copy";
  }
}
