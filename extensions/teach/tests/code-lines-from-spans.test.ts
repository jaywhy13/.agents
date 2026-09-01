import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CodeBeat } from "../shared/beat.ts";
import { parseCodeBeat } from "../shared/beat.ts";
import type { CodeSpan } from "../shared/code-lines.ts";
import { codeLinesFromSpans } from "../shared/code-lines.ts";

function codeBeat(overrides: Record<string, unknown> = {}): CodeBeat {
  return parseCodeBeat({
    kind: "code",
    beatId: "beat-1",
    lessonId: "lesson-1",
    sequenceNumber: 1,
    createdAt: "2024-05-01T10:00:00.000Z",
    language: "typescript",
    fileName: "queue.ts",
    code: "const queue = [];\nqueue.push(job);",
    explanation: "Two lines put a job on the end of the queue.",
    emphasizedLineRanges: [],
    ...overrides,
  });
}

function plainSpan(text: string): CodeSpan {
  return { text, tokenType: null };
}

describe("codeLinesFromSpans", () => {
  it("cuts the highlighted spans into the lines the page draws", () => {
    const lines = codeLinesFromSpans(codeBeat(), [
      { text: "const", tokenType: "keyword" },
      plainSpan(" queue = [];\nqueue.push(job);"),
    ]);

    assert.deepEqual(
      lines.map((line) => line.spans),
      [
        [
          { text: "const", tokenType: "keyword" },
          { text: " queue = [];", tokenType: null },
        ],
        [{ text: "queue.push(job);", tokenType: null }],
      ],
    );
  });

  it("keeps the token type on both sides of a span that runs over a line break", () => {
    const lines = codeLinesFromSpans(
      codeBeat({ code: "/* holds\n   work */", language: "typescript" }),
      [{ text: "/* holds\n   work */", tokenType: "comment" }],
    );

    assert.deepEqual(
      lines.map((line) => line.spans),
      [
        [{ text: "/* holds", tokenType: "comment" }],
        [{ text: "   work */", tokenType: "comment" }],
      ],
    );
  });

  it("numbers the lines from one", () => {
    const lines = codeLinesFromSpans(codeBeat(), [
      plainSpan("const queue = [];\nqueue.push(job);"),
    ]);

    assert.deepEqual(
      lines.map((line) => line.lineNumber),
      [1, 2],
    );
  });

  it("marks the lines the lesson asked the learner to look at", () => {
    const lines = codeLinesFromSpans(
      codeBeat({ emphasizedLineRanges: [{ startLine: 2, endLine: 2 }] }),
      [plainSpan("const queue = [];\nqueue.push(job);")],
    );

    assert.deepEqual(
      lines.map((line) => line.isEmphasized),
      [false, true],
    );
  });

  it("keeps a blank line, so the code keeps its shape", () => {
    const lines = codeLinesFromSpans(codeBeat({ code: "first\n\nthird" }), [
      plainSpan("first\n\nthird"),
    ]);

    assert.deepEqual(
      lines.map((line) => line.text),
      ["first", "", "third"],
    );
    assert.deepEqual(lines[1]?.spans, []);
  });

  it("falls back to the plain line when the spans do not cover the code", () => {
    const lines = codeLinesFromSpans(codeBeat(), [plainSpan("const queue = [];")]);

    assert.deepEqual(lines[1]?.spans, [{ text: "queue.push(job);", tokenType: null }]);
  });
});
