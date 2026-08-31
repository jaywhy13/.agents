/** The most a single read may hand back, whichever limit is reached first. */
export const MAXIMUM_EXCERPT_BYTES = 50 * 1024;
export const MAXIMUM_EXCERPT_LINES = 2000;

export type ExcerptTruncationReason = "line_limit" | "byte_limit";

export interface ExcerptWindow {
  /** The first line to read, counting from 1. */
  readonly offset?: number;
  /** The most lines to read. Never more than the line limit. */
  readonly limit?: number;
}

export interface TextExcerpt {
  readonly text: string;
  readonly firstLineNumber: number;
  readonly lineCount: number;
  readonly totalLineCount: number;
  readonly byteLength: number;
  readonly totalByteLength: number;
  readonly truncated: boolean;
  readonly truncationReason: ExcerptTruncationReason | null;
  /** Where a following read should start, or null when the end was reached. */
  readonly nextLineNumber: number | null;
}

export class InvalidExcerptWindowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidExcerptWindowError";
  }
}

/**
 * Reads a window of a reference instead of the whole thing.
 *
 * A reference can be a whole web page or a whole source file, and the lesson runs
 * on a model with a budget. So a read is always bounded twice — by lines and by
 * bytes — and always says where the next read should start. That way the lesson
 * can walk through evidence a piece at a time and never has to hold all of it.
 */
export function takeTextExcerpt(content: string, window: ExcerptWindow = {}): TextExcerpt {
  const firstLineNumber = requireOffset(window.offset);
  const lineLimit = requireLimit(window.limit);

  const lines = content.split("\n");
  const totalLineCount = lines.length;
  const totalByteLength = Buffer.byteLength(content, "utf8");

  if (firstLineNumber > totalLineCount) {
    return {
      text: "",
      firstLineNumber,
      lineCount: 0,
      totalLineCount,
      byteLength: 0,
      totalByteLength,
      truncated: false,
      truncationReason: null,
      nextLineNumber: null,
    };
  }

  const taken = takeLinesWithinByteBudget(lines, firstLineNumber - 1, lineLimit);
  const text = taken.lines.join("\n");
  const lastLineNumber = firstLineNumber + taken.lines.length - 1;
  const reachedEnd = lastLineNumber >= totalLineCount && taken.truncationReason !== "byte_limit";

  return {
    text,
    firstLineNumber,
    lineCount: taken.lines.length,
    totalLineCount,
    byteLength: Buffer.byteLength(text, "utf8"),
    totalByteLength,
    truncated: !reachedEnd,
    truncationReason: reachedEnd ? null : (taken.truncationReason ?? "line_limit"),
    nextLineNumber: reachedEnd ? null : lastLineNumber + 1,
  };
}

interface TakenLines {
  readonly lines: readonly string[];
  readonly truncationReason: ExcerptTruncationReason | null;
}

function takeLinesWithinByteBudget(
  lines: readonly string[],
  startIndex: number,
  lineLimit: number,
): TakenLines {
  const taken: string[] = [];
  let usedBytes = 0;

  for (let index = startIndex; index < lines.length && taken.length < lineLimit; index += 1) {
    const line = lines[index] ?? "";
    const lineBytes = Buffer.byteLength(line, "utf8") + (taken.length === 0 ? 0 : 1);

    if (usedBytes + lineBytes > MAXIMUM_EXCERPT_BYTES) {
      if (taken.length > 0) {
        return { lines: taken, truncationReason: "byte_limit" };
      }
      // One line on its own is over the budget. It is cut rather than refused, so
      // a reference made of one very long line is still readable.
      return {
        lines: [clipToByteBudget(line, MAXIMUM_EXCERPT_BYTES)],
        truncationReason: "byte_limit",
      };
    }

    usedBytes += lineBytes;
    taken.push(line);
  }

  const stoppedOnLineLimit = taken.length === lineLimit && startIndex + taken.length < lines.length;
  return { lines: taken, truncationReason: stoppedOnLineLimit ? "line_limit" : null };
}

/** Cuts on a character boundary, so the result is never half a character. */
function clipToByteBudget(line: string, budgetBytes: number): string {
  let clipped = "";
  let usedBytes = 0;
  for (const character of line) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (usedBytes + characterBytes > budgetBytes) {
      break;
    }
    clipped += character;
    usedBytes += characterBytes;
  }
  return clipped;
}

function requireOffset(offset: number | undefined): number {
  if (offset === undefined) {
    return 1;
  }
  if (!Number.isInteger(offset) || offset < 1) {
    throw new InvalidExcerptWindowError("An offset must be a line number of 1 or more.");
  }
  return offset;
}

function requireLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return MAXIMUM_EXCERPT_LINES;
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new InvalidExcerptWindowError("A limit must be a line count of 1 or more.");
  }
  return Math.min(limit, MAXIMUM_EXCERPT_LINES);
}
