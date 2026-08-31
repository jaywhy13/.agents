import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAXIMUM_SELECTION_CHARACTERS } from "../shared/client-message.ts";
import { definableSelection } from "../shared/selection-definition.ts";

describe("definableSelection", () => {
  it("keeps the words the learner highlighted", () => {
    assert.equal(definableSelection("back pressure"), "back pressure");
  });

  it("drops the spaces a highlight picks up at either end", () => {
    assert.equal(definableSelection("  back pressure\n"), "back pressure");
  });

  it("puts a highlight that runs over a line break onto one line", () => {
    assert.equal(definableSelection("back\n   pressure"), "back pressure");
  });

  it("refuses a highlight that is only whitespace", () => {
    assert.equal(definableSelection("   \n  "), null);
  });

  it("refuses a highlight of a whole paragraph, which is not a term", () => {
    const paragraph = "word ".repeat(MAXIMUM_SELECTION_CHARACTERS);

    assert.equal(definableSelection(paragraph), null);
  });

  it("accepts a highlight of exactly the longest length allowed", () => {
    const longestTerm = "a".repeat(MAXIMUM_SELECTION_CHARACTERS);

    assert.equal(definableSelection(longestTerm), longestTerm);
  });
});
