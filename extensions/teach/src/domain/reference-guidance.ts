import type { StoredReference } from "../references/reference.ts";
import type { ReferenceExcerpt } from "../references/reference-library-service.ts";

/**
 * What the lesson says back to the teaching model about the background the learner
 * supplied.
 *
 * The model never has any of a reference in its system prompt: only the label and
 * the id. So these words are the whole of what it knows about how to read one, and
 * they are teaching guidance rather than plumbing — which is why they live in the
 * domain and are tested here.
 */

export function referenceListing(references: readonly StoredReference[]): string {
  if (references.length === 0) {
    return "The learner supplied no background for this lesson. Teach from what you know.";
  }

  const lines = references.map((reference) => describeStoredReference(reference));
  return [
    `The learner supplied ${references.length} reference${references.length === 1 ? "" : "s"}.`,
    "Read one with read_lesson_reference before you claim what it says.",
    ...lines,
  ].join("\n");
}

function describeStoredReference(reference: StoredReference): string {
  const where = reference.sourceUrl === null ? "pasted notes" : reference.sourceUrl;
  return `- ${reference.referenceId} — "${reference.label}" (${reference.kind}, ${reference.lineCount} lines, from ${where})`;
}

export function referenceExcerptReport(excerpt: ReferenceExcerpt): string {
  const header = [
    `Reference ${excerpt.referenceId} ("${excerpt.label}"), lines ${excerpt.firstLineNumber} to ${excerpt.firstLineNumber + Math.max(excerpt.lineCount - 1, 0)} of ${excerpt.totalLineCount}.`,
    excerpt.nextLineNumber === null
      ? "This is the end of the reference."
      : `Read on from line ${excerpt.nextLineNumber} with another call.`,
  ].join(" ");

  if (excerpt.lineCount === 0) {
    return `${header}\nThere is nothing at that line number.`;
  }
  return `${header}\n\n${excerpt.text}`;
}

export function referenceNotFound(referenceId: string): string {
  return `This lesson has no reference "${referenceId}". Call list_lesson_references to see what it has.`;
}
