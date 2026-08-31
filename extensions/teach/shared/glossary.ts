import type { DefinitionBeat } from "./beat.ts";
import type { BrowserBeat } from "./browser-beat.ts";

/**
 * The glossary is not stored on its own. It is derived from the definition beats
 * in the lesson, so the beat log stays the only record of what was taught and the
 * panel can never drift from it.
 */
export interface GlossaryEntry {
  readonly term: string;
  readonly fullForm: string | null;
  readonly plainLanguageMeaning: string;
  readonly example: string | null;
  /** The definition beat this entry came from. */
  readonly beatId: string;
}

export function glossaryFromBeats(beats: readonly BrowserBeat[]): readonly GlossaryEntry[] {
  const entriesByTerm = new Map<string, GlossaryEntry>();

  for (const beat of beats) {
    if (beat.kind !== "definition") {
      continue;
    }
    // A term taught again replaces the earlier attempt: the newest wording is the
    // one the learner just heard.
    entriesByTerm.set(beat.term.trim().toLowerCase(), toGlossaryEntry(beat));
  }

  return [...entriesByTerm.values()].sort((left, right) =>
    left.term.localeCompare(right.term, "en", { sensitivity: "base" }),
  );
}

/**
 * Every name a glossary entry can be recognised by: the term, plus the full form
 * of an acronym. Used both for highlighting prose and for telling a new teaching
 * turn what the learner already has words for.
 */
export function glossaryTermNames(entries: readonly GlossaryEntry[]): readonly string[] {
  const names: string[] = [];
  for (const entry of entries) {
    names.push(entry.term);
    if (entry.fullForm !== null) {
      names.push(entry.fullForm);
    }
  }
  return names;
}

function toGlossaryEntry(beat: DefinitionBeat): GlossaryEntry {
  return {
    term: beat.term,
    fullForm: beat.fullForm,
    plainLanguageMeaning: beat.plainLanguageMeaning,
    example: beat.example,
    beatId: beat.beatId,
  };
}
