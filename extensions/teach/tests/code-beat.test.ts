import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBeat, parseCodeBeat } from "../shared/beat.ts";
import { codeLinesWithEmphasis } from "../shared/code-lines.ts";

const SAMPLE_CODE = "function push(job) {\n  queue.append(job);\n  return job.id;\n}";

function codePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "code",
    beatId: "beat-4",
    lessonId: "lesson-1",
    sequenceNumber: 4,
    createdAt: "2024-05-01T10:00:00.000Z",
    language: "javascript",
    fileName: "queue.js",
    code: SAMPLE_CODE,
    explanation: "This adds one job to the end of the queue.",
    emphasizedLineRanges: [{ startLine: 2, endLine: 2 }],
    ...overrides,
  };
}

describe("parseCodeBeat", () => {
  it("returns a typed code beat for a valid payload", () => {
    const beat = parseCodeBeat(codePayload());

    assert.equal(beat.kind, "code");
    assert.equal(beat.language, "javascript");
    assert.equal(beat.code, SAMPLE_CODE);
    assert.equal(beat.explanation, "This adds one job to the end of the queue.");
  });

  it("keeps the file name when the code came from a file", () => {
    assert.equal(parseCodeBeat(codePayload()).fileName, "queue.js");
  });

  it("treats a missing file name as no file name, because a snippet need not have one", () => {
    assert.equal(parseCodeBeat(codePayload({ fileName: undefined })).fileName, null);
  });

  it("keeps the lines the lesson wants the learner to look at", () => {
    assert.deepEqual(parseCodeBeat(codePayload()).emphasizedLineRanges, [
      { startLine: 2, endLine: 2 },
    ]);
  });

  it("treats missing emphasis as no emphasis", () => {
    assert.deepEqual(
      parseCodeBeat(codePayload({ emphasizedLineRanges: undefined })).emphasizedLineRanges,
      [],
    );
  });

  it("rejects code with no language, because the page cannot highlight it", () => {
    assert.throws(() => parseCodeBeat(codePayload({ language: "" })), /language/);
  });

  it("rejects a language name that is not a language name", () => {
    assert.throws(() => parseCodeBeat(codePayload({ language: "java script!" })), /language/);
  });

  it("rejects code with no explanation, because code alone teaches nothing", () => {
    assert.throws(() => parseCodeBeat(codePayload({ explanation: "  " })), /explanation/);
  });

  it("rejects an empty code block", () => {
    assert.throws(() => parseCodeBeat(codePayload({ code: "" })), /code/);
  });

  it("rejects an emphasis range that ends before it starts", () => {
    assert.throws(
      () => parseCodeBeat(codePayload({ emphasizedLineRanges: [{ startLine: 3, endLine: 2 }] })),
      /endLine/,
    );
  });

  it("rejects an emphasis range past the end of the code", () => {
    assert.throws(
      () => parseCodeBeat(codePayload({ emphasizedLineRanges: [{ startLine: 1, endLine: 9 }] })),
      /endLine/,
    );
  });

  it("rejects an emphasis range that starts at line zero", () => {
    assert.throws(
      () => parseCodeBeat(codePayload({ emphasizedLineRanges: [{ startLine: 0, endLine: 1 }] })),
      /startLine/,
    );
  });

  it("is reached through parseBeat, so a stored code beat can be replayed", () => {
    assert.equal(parseBeat(codePayload()).kind, "code");
  });
});

describe("codeLinesWithEmphasis", () => {
  it("numbers every line of the code from one", () => {
    const lines = codeLinesWithEmphasis(parseCodeBeat(codePayload()));

    assert.deepEqual(
      lines.map((line) => line.lineNumber),
      [1, 2, 3, 4],
    );
  });

  it("marks only the lines inside an emphasis range", () => {
    const lines = codeLinesWithEmphasis(parseCodeBeat(codePayload()));

    assert.deepEqual(
      lines.map((line) => line.isEmphasized),
      [false, true, false, false],
    );
  });

  it("marks every line of a range that covers several lines", () => {
    const lines = codeLinesWithEmphasis(
      parseCodeBeat(codePayload({ emphasizedLineRanges: [{ startLine: 1, endLine: 3 }] })),
    );

    assert.deepEqual(
      lines.map((line) => line.isEmphasized),
      [true, true, true, false],
    );
  });

  it("keeps the text of each line as it was written", () => {
    const lines = codeLinesWithEmphasis(parseCodeBeat(codePayload()));

    assert.equal(lines[1]?.text, "  queue.append(job);");
  });
});
