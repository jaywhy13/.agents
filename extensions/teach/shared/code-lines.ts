import type { CodeBeat } from "./beat.ts";

export interface CodeLine {
  readonly lineNumber: number;
  readonly text: string;
  /** True when this line is inside one of the beat's emphasis ranges. */
  readonly isEmphasized: boolean;
}

/**
 * Turns a code beat into the lines the page draws. The emphasis ranges are stored
 * as ranges because that is how a lesson thinks about code, but every renderer
 * needs them line by line, so the derivation lives here once.
 */
export function codeLinesWithEmphasis(beat: CodeBeat): readonly CodeLine[] {
  return beat.code.split("\n").map((text, index) => {
    const lineNumber = index + 1;
    return { lineNumber, text, isEmphasized: isInAnyRange(beat, lineNumber) };
  });
}

/**
 * One run of code that is all the same kind of thing: a keyword, a string, a
 * comment, or plain code when `tokenType` is null. The page turns the type into a
 * colour; who worked the types out is not this module's business.
 */
export interface CodeSpan {
  readonly text: string;
  readonly tokenType: string | null;
}

export interface HighlightedCodeLine extends CodeLine {
  readonly spans: readonly CodeSpan[];
}

/**
 * Puts highlighted spans onto the lines the page draws.
 *
 * The highlighter reads the whole snippet at once, so a comment or a string that
 * runs over several lines comes back as one span. Cutting the spans here, rather
 * than highlighting each line on its own, is what keeps those spans coloured all
 * the way through.
 */
export function codeLinesFromSpans(
  beat: CodeBeat,
  spans: readonly CodeSpan[],
): readonly HighlightedCodeLine[] {
  const spansByLine = spansCutAtLineBreaks(spans);

  return codeLinesWithEmphasis(beat).map((line, index) => ({
    ...line,
    // A highlighter that returned something other than the code it was given must
    // not lose the line: the plain text is shown instead.
    spans: spansByLine[index] ?? plainSpansFor(line.text),
  }));
}

function spansCutAtLineBreaks(spans: readonly CodeSpan[]): readonly (readonly CodeSpan[])[] {
  const lines: CodeSpan[][] = [[]];

  for (const span of spans) {
    const partsOfSpan = span.text.split("\n");
    for (const [index, part] of partsOfSpan.entries()) {
      if (index > 0) {
        lines.push([]);
      }
      if (part.length > 0) {
        lines[lines.length - 1]?.push({ text: part, tokenType: span.tokenType });
      }
    }
  }

  return lines;
}

function plainSpansFor(text: string): readonly CodeSpan[] {
  return text.length === 0 ? [] : [{ text, tokenType: null }];
}

function isInAnyRange(beat: CodeBeat, lineNumber: number): boolean {
  for (const range of beat.emphasizedLineRanges) {
    if (lineNumber >= range.startLine && lineNumber <= range.endLine) {
      return true;
    }
  }
  return false;
}
