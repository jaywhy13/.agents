import { useEffect, useState } from "react";

import { definableSelection } from "../../shared/selection-definition.ts";

/**
 * The words the learner has highlighted, when they are short enough to be a term
 * the lesson could define. Null the rest of the time, so the page only offers the
 * button when pressing it would work.
 */
export function useDefinableSelection(): string | null {
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);

  useEffect(() => {
    function readSelection(): void {
      setSelectedTerm(definableSelection(window.getSelection()?.toString() ?? ""));
    }

    document.addEventListener("selectionchange", readSelection);
    return () => document.removeEventListener("selectionchange", readSelection);
  }, []);

  return selectedTerm;
}
