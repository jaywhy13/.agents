import { MAXIMUM_SELECTION_CHARACTERS } from "./client-message.ts";

/**
 * The term the lesson would define from what the learner highlighted, or null when
 * the highlight is not a term.
 *
 * A highlight drags in the line breaks and indentation of whatever it ran across,
 * so the words are put back onto one line first. A highlight of a whole paragraph
 * is refused here rather than by the lesson, so the page never offers a button
 * that cannot work.
 */
export function definableSelection(rawSelection: string): string | null {
  const selectedTerm = rawSelection.replace(/\s+/gu, " ").trim();
  if (selectedTerm.length === 0 || selectedTerm.length > MAXIMUM_SELECTION_CHARACTERS) {
    return null;
  }
  return selectedTerm;
}
