import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { splitProseByTerms } from "../shared/term-highlighting.ts";

function highlightedTerms(text: string, terms: readonly string[]): string[] {
  const highlighted: string[] = [];
  for (const segment of splitProseByTerms(text, terms)) {
    if (segment.kind === "term") {
      highlighted.push(segment.text);
    }
  }
  return highlighted;
}

function rebuiltText(text: string, terms: readonly string[]): string {
  return splitProseByTerms(text, terms)
    .map((segment) => segment.text)
    .join("");
}

describe("splitProseByTerms", () => {
  it("returns the prose as one plain segment when no term is known yet", () => {
    const segments = splitProseByTerms("A queue holds work.", []);

    assert.deepEqual(segments, [{ kind: "text", text: "A queue holds work.", term: null }]);
  });

  it("marks a known term inside the prose", () => {
    assert.deepEqual(highlightedTerms("A queue holds work.", ["queue"]), ["queue"]);
  });

  it("never loses or changes a character of the prose", () => {
    const text = "A message queue holds work for a worker.";

    assert.equal(rebuiltText(text, ["queue", "message queue", "worker"]), text);
  });

  it("prefers the longest term when two terms start at the same place", () => {
    assert.deepEqual(highlightedTerms("A message queue holds work.", ["message", "message queue"]), [
      "message queue",
    ]);
  });

  it("matches a term written with different capitals", () => {
    assert.deepEqual(highlightedTerms("The Queue holds work.", ["queue"]), ["Queue"]);
  });

  it("names the glossary term for a match, whatever capitals the prose used", () => {
    const segments = splitProseByTerms("The Queue holds work.", ["queue"]);
    const termSegment = segments.find((segment) => segment.kind === "term");

    assert.equal(termSegment?.term, "queue");
  });

  it("leaves a longer word alone, so \"queue\" does not light up inside \"queueing\"", () => {
    assert.deepEqual(highlightedTerms("Queueing work is different.", ["queue"]), []);
  });

  it("leaves a term alone when it is only part of a word", () => {
    assert.deepEqual(highlightedTerms("The subqueue is separate.", ["queue"]), []);
  });

  it("marks every occurrence of a term", () => {
    assert.deepEqual(highlightedTerms("A queue is a queue.", ["queue"]), ["queue", "queue"]);
  });

  it("marks terms that touch punctuation", () => {
    assert.deepEqual(highlightedTerms("Use a queue, always.", ["queue"]), ["queue"]);
  });

  it("ignores a blank term, so an empty glossary entry cannot split every character", () => {
    assert.deepEqual(splitProseByTerms("A queue.", ["  "]), [
      { kind: "text", text: "A queue.", term: null },
    ]);
  });

  it("returns nothing for empty prose", () => {
    assert.deepEqual(splitProseByTerms("", ["queue"]), []);
  });
});
