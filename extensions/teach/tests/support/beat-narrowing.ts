import assert from "node:assert/strict";

import type {
  Beat,
  BeatKind,
  CodeBeat,
  ConceptCardBeat,
  DefinitionBeat,
  LessonEndBeat,
  NarrationBeat,
  PauseBeat,
  DiagramBeat,
  ImageBeat,
  QuizBeat,
} from "../../shared/beat.ts";
import type { BrowserBeat, BrowserQuizBeat } from "../../shared/browser-beat.ts";

/**
 * A beat is a union, so a test that wants one kind has to say which. These helpers
 * fail the test with the kind that actually arrived, rather than throwing a type
 * error at the assertion below.
 *
 * They take a stored beat or a beat on its way to the browser, because a test often
 * reads the messages the lesson sent rather than what it wrote down. The two differ
 * only in a quiz beat's answer key, so `asQuiz` is the one helper that has to say
 * which of the two it is looking at.
 */
function ofKind<K extends BeatKind>(
  beat: Beat | BrowserBeat | undefined,
  kind: K,
): Extract<Beat, { kind: K }> {
  assert.equal(beat?.kind, kind, `expected a ${kind} beat, got ${beat?.kind ?? "nothing"}`);
  return beat as Extract<Beat, { kind: K }>;
}

export function asConceptCard(beat: Beat | BrowserBeat | undefined): ConceptCardBeat {
  return ofKind(beat, "concept_card");
}

export function asDefinition(beat: Beat | BrowserBeat | undefined): DefinitionBeat {
  return ofKind(beat, "definition");
}

export function asCode(beat: Beat | BrowserBeat | undefined): CodeBeat {
  return ofKind(beat, "code");
}

export function asDiagram(beat: Beat | BrowserBeat | undefined): DiagramBeat {
  return ofKind(beat, "diagram");
}

export function asImage(beat: Beat | BrowserBeat | undefined): ImageBeat {
  return ofKind(beat, "image");
}

export function asQuiz(beat: Beat | undefined): QuizBeat {
  return ofKind(beat, "quiz");
}

/** A quiz beat as the browser got it: same question, no answer key. */
export function asBrowserQuiz(beat: BrowserBeat | undefined): BrowserQuizBeat {
  assert.equal(beat?.kind, "quiz", `expected a quiz beat, got ${beat?.kind ?? "nothing"}`);
  return beat as BrowserQuizBeat;
}

export function asPause(beat: Beat | BrowserBeat | undefined): PauseBeat {
  return ofKind(beat, "pause");
}

export function asLessonEnd(beat: Beat | BrowserBeat | undefined): LessonEndBeat {
  return ofKind(beat, "lesson_end");
}

export function asNarration(beat: Beat | BrowserBeat | undefined): NarrationBeat {
  return ofKind(beat, "narration");
}

export function beatsOfKind<K extends BeatKind>(
  beats: readonly (Beat | BrowserBeat)[],
  kind: K,
): Array<Extract<Beat, { kind: K }>> {
  const matching: Array<Extract<Beat, { kind: K }>> = [];
  for (const beat of beats) {
    if (beat.kind === kind) {
      matching.push(beat as Extract<Beat, { kind: K }>);
    }
  }
  return matching;
}
