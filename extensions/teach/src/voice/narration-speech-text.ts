/**
 * Turns the words of a beat into the short lines the speech route is given.
 *
 * Speech through the proxy is request/response, so a learner hears nothing until a
 * whole line comes back. Splitting on sentence ends keeps each wait short and lets
 * the page start playing the first line while the next is still being made.
 *
 * Pure on purpose: no network, no cache, no clock. The splitting rule is the part
 * that decides how the lesson sounds, so it is testable on its own.
 */

import type { NarrationChunk } from "../../shared/beat.ts";
import { narrationPlainText } from "../../shared/narration.ts";
import { LONGEST_SPEECH_CHARACTERS } from "./voice-limits.ts";

const SENTENCE_END_PATTERN = /(?<=[.!?])\s+/;

export function speechTextForNarration(chunks: readonly NarrationChunk[]): string {
  return narrationPlainText(chunks);
}

/**
 * Splits text into ordered lines, each within `longestLineCharacters`.
 *
 * Sentences are kept whole where they fit. A sentence longer than the limit is cut
 * on word boundaries, and a single word longer than the limit is cut by characters,
 * so the function always returns lines the speech route will accept.
 */
export function splitIntoSpeechLines(
  text: string,
  longestLineCharacters: number = LONGEST_SPEECH_CHARACTERS,
): readonly string[] {
  const collapsedText = text.replace(/\s+/g, " ").trim();
  if (collapsedText === "") {
    return [];
  }

  const lines: string[] = [];
  let currentLine = "";

  for (const sentence of collapsedText.split(SENTENCE_END_PATTERN)) {
    for (const piece of piecesWithin(sentence, longestLineCharacters)) {
      if (currentLine === "") {
        currentLine = piece;
        continue;
      }
      if (currentLine.length + 1 + piece.length <= longestLineCharacters) {
        currentLine = `${currentLine} ${piece}`;
        continue;
      }
      lines.push(currentLine);
      currentLine = piece;
    }
  }

  if (currentLine !== "") {
    lines.push(currentLine);
  }
  return lines;
}

/** One sentence, cut down until every piece fits. */
function piecesWithin(sentence: string, longestLineCharacters: number): readonly string[] {
  const trimmedSentence = sentence.trim();
  if (trimmedSentence === "") {
    return [];
  }
  if (trimmedSentence.length <= longestLineCharacters) {
    return [trimmedSentence];
  }

  const pieces: string[] = [];
  let currentPiece = "";

  for (const word of trimmedSentence.split(" ")) {
    for (const wordPart of wordPartsWithin(word, longestLineCharacters)) {
      if (currentPiece === "") {
        currentPiece = wordPart;
      } else if (currentPiece.length + 1 + wordPart.length <= longestLineCharacters) {
        currentPiece = `${currentPiece} ${wordPart}`;
      } else {
        pieces.push(currentPiece);
        currentPiece = wordPart;
      }
    }
  }

  if (currentPiece !== "") {
    pieces.push(currentPiece);
  }
  return pieces;
}

/** A pasted identifier or URL can be longer than a whole line on its own. */
function wordPartsWithin(word: string, longestLineCharacters: number): readonly string[] {
  if (word.length <= longestLineCharacters) {
    return word === "" ? [] : [word];
  }

  const parts: string[] = [];
  for (let start = 0; start < word.length; start += longestLineCharacters) {
    parts.push(word.slice(start, start + longestLineCharacters));
  }
  return parts;
}
