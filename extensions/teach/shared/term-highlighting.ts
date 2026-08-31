/**
 * Splits prose into plain runs and glossary-term runs, so the page can mark a term
 * the learner has already been given a definition for.
 *
 * This is for prose only. Code is never split by it: a term such as "map" or
 * "queue" appears inside identifiers all the time, and marking words inside code
 * would change what the code looks like. The code beat renderer highlights syntax
 * instead and never calls this.
 *
 * Matching is longest-first, so "message queue" wins over "queue", and only whole
 * words match, so "queue" does not light up inside "queueing".
 */

export interface ProseSegment {
  readonly kind: "text" | "term";
  /** The prose exactly as it was written, including its own capitals. */
  readonly text: string;
  /** The glossary term this run matched, or null for plain prose. */
  readonly term: string | null;
}

export function splitProseByTerms(text: string, terms: readonly string[]): readonly ProseSegment[] {
  if (text.length === 0) {
    return [];
  }

  const searchableTerms = longestFirst(terms);
  if (searchableTerms.length === 0) {
    return [plainSegment(text)];
  }

  const lowerCaseText = text.toLowerCase();
  const segments: ProseSegment[] = [];
  let plainRunStart = 0;
  let position = 0;

  while (position < text.length) {
    const matchedTerm = termStartingAt(lowerCaseText, position, searchableTerms);
    if (matchedTerm === null) {
      position += 1;
      continue;
    }

    if (position > plainRunStart) {
      segments.push(plainSegment(text.slice(plainRunStart, position)));
    }
    const matchEnd = position + matchedTerm.length;
    segments.push({
      kind: "term",
      text: text.slice(position, matchEnd),
      term: matchedTerm,
    });
    position = matchEnd;
    plainRunStart = matchEnd;
  }

  if (plainRunStart < text.length) {
    segments.push(plainSegment(text.slice(plainRunStart)));
  }

  return segments;
}

function termStartingAt(
  lowerCaseText: string,
  position: number,
  searchableTerms: readonly string[],
): string | null {
  for (const term of searchableTerms) {
    const lowerCaseTerm = term.toLowerCase();
    if (!lowerCaseText.startsWith(lowerCaseTerm, position)) {
      continue;
    }
    if (isWholeWord(lowerCaseText, position, position + lowerCaseTerm.length)) {
      return term;
    }
  }
  return null;
}

function isWholeWord(text: string, start: number, end: number): boolean {
  return !isWordCharacter(text[start - 1]) && !isWordCharacter(text[end]);
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{N}_]/u.test(character);
}

/** Longest first, so a term that contains a shorter term is matched as a whole. */
function longestFirst(terms: readonly string[]): readonly string[] {
  return terms
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .sort((left, right) => right.length - left.length);
}

function plainSegment(text: string): ProseSegment {
  return { kind: "text", text, term: null };
}
