import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  InvalidExcerptWindowError,
  MAXIMUM_EXCERPT_BYTES,
  MAXIMUM_EXCERPT_LINES,
  takeTextExcerpt,
} from "../../src/references/reference-excerpt.ts";

function numberedLines(lineCount: number): string {
  const lines: string[] = [];
  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
    lines.push(`line ${lineNumber}`);
  }
  return lines.join("\n");
}

describe("takeTextExcerpt", () => {
  it("returns the whole text when it is small", () => {
    const excerpt = takeTextExcerpt("one\ntwo\nthree");

    assert.equal(excerpt.text, "one\ntwo\nthree");
    assert.equal(excerpt.truncated, false);
    assert.equal(excerpt.nextLineNumber, null);
  });

  it("starts at the offset, counting lines from one", () => {
    const excerpt = takeTextExcerpt("one\ntwo\nthree", { offset: 2 });

    assert.equal(excerpt.text, "two\nthree");
    assert.equal(excerpt.firstLineNumber, 2);
  });

  it("returns at most the requested number of lines", () => {
    const excerpt = takeTextExcerpt(numberedLines(10), { limit: 3 });

    assert.equal(excerpt.text, "line 1\nline 2\nline 3");
    assert.equal(excerpt.lineCount, 3);
  });

  it("says where the next read should start", () => {
    const excerpt = takeTextExcerpt(numberedLines(10), { limit: 3 });

    assert.equal(excerpt.nextLineNumber, 4);
  });

  it("reads the rest of the text on a following read", () => {
    const firstExcerpt = takeTextExcerpt(numberedLines(5), { limit: 3 });
    const secondExcerpt = takeTextExcerpt(numberedLines(5), {
      offset: firstExcerpt.nextLineNumber ?? 1,
    });

    assert.equal(secondExcerpt.text, "line 4\nline 5");
    assert.equal(secondExcerpt.nextLineNumber, null);
  });

  it("stops at the line limit even when no limit was asked for", () => {
    const excerpt = takeTextExcerpt(numberedLines(MAXIMUM_EXCERPT_LINES + 50));

    assert.equal(excerpt.lineCount, MAXIMUM_EXCERPT_LINES);
    assert.equal(excerpt.truncationReason, "line_limit");
  });

  it("never returns more lines than the line limit, whatever was asked for", () => {
    const excerpt = takeTextExcerpt(numberedLines(MAXIMUM_EXCERPT_LINES + 50), { limit: 10_000 });

    assert.equal(excerpt.lineCount, MAXIMUM_EXCERPT_LINES);
  });

  it("stops at the byte limit before the line limit when lines are long", () => {
    const longLine = "x".repeat(1000);
    const manyLongLines = new Array<string>(200).fill(longLine).join("\n");

    const excerpt = takeTextExcerpt(manyLongLines);

    assert.equal(excerpt.truncationReason, "byte_limit");
    assert.ok(excerpt.byteLength <= MAXIMUM_EXCERPT_BYTES);
  });

  it("cuts one very long line rather than refusing to read it", () => {
    const oneVeryLongLine = "y".repeat(MAXIMUM_EXCERPT_BYTES * 2);

    const excerpt = takeTextExcerpt(oneVeryLongLine);

    assert.equal(excerpt.byteLength, MAXIMUM_EXCERPT_BYTES);
    assert.equal(excerpt.truncated, true);
    assert.equal(excerpt.truncationReason, "byte_limit");
  });

  it("reports how big the whole reference is, not only the window", () => {
    const excerpt = takeTextExcerpt(numberedLines(10), { limit: 2 });

    assert.equal(excerpt.totalLineCount, 10);
    assert.equal(excerpt.totalByteLength, Buffer.byteLength(numberedLines(10), "utf8"));
  });

  it("returns nothing when the offset is past the end", () => {
    const excerpt = takeTextExcerpt("one\ntwo", { offset: 99 });

    assert.equal(excerpt.text, "");
    assert.equal(excerpt.lineCount, 0);
    assert.equal(excerpt.nextLineNumber, null);
  });

  it("refuses an offset below one", () => {
    assert.throws(() => takeTextExcerpt("one", { offset: 0 }), InvalidExcerptWindowError);
  });

  it("refuses a limit below one", () => {
    assert.throws(() => takeTextExcerpt("one", { limit: 0 }), InvalidExcerptWindowError);
  });
});
