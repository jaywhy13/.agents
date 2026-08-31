/**
 * The beat as the lesson page is allowed to see it.
 *
 * A quiz beat holds the answer key: which choices are right, or what an answer in
 * the learner's own words has to say. The lesson server needs both to grade, and the
 * learner must not have either — the page runs on the learner's own machine, so
 * anything sent to it is readable in the browser's network panel before the question
 * has even been answered.
 *
 * So the answer key is dropped on the way out. The message the server sends is
 * typed as a `BrowserBeat`, which has no field to put the answer key in. That is the
 * braces; `beatForBrowser` is the belt, because a full `Beat` is still assignable to
 * a `BrowserBeat` and so a value that is typed browser-safe may still be carrying
 * the key at runtime.
 *
 * What was right is told to the learner afterwards, through `QuizResult`, once the
 * answer has been graded.
 */

import type {
  Beat,
  MultipleChoiceQuizBeat,
  QuizBeat,
  ShortTextQuizBeat,
} from "./beat.ts";

export type BrowserMultipleChoiceQuizBeat = Omit<MultipleChoiceQuizBeat, "correctChoiceIds">;

export type BrowserShortTextQuizBeat = Omit<ShortTextQuizBeat, "correctAnswerCriteria">;

export type BrowserQuizBeat = BrowserMultipleChoiceQuizBeat | BrowserShortTextQuizBeat;

export type BrowserBeat = Exclude<Beat, QuizBeat> | BrowserQuizBeat;

/**
 * Whatever a stored quiz beat has that a browser-safe one does not. Derived from the
 * two types rather than written out, so adding a secret field to a quiz beat and
 * forgetting to redact it does not compile.
 */
type AnswerKeyField =
  | Exclude<keyof MultipleChoiceQuizBeat, keyof BrowserMultipleChoiceQuizBeat>
  | Exclude<keyof ShortTextQuizBeat, keyof BrowserShortTextQuizBeat>;

export const ANSWER_KEY_FIELDS = ["correctChoiceIds", "correctAnswerCriteria"] as const;

// Both directions, so the list can neither miss a field nor name one that is fine
// to send. Neither assignment produces any runtime code.
const everyAnswerKeyFieldIsListed: readonly (typeof ANSWER_KEY_FIELDS)[number][] =
  [] as readonly AnswerKeyField[];
const nothingHarmlessIsListed: readonly AnswerKeyField[] = [] as readonly (
  (typeof ANSWER_KEY_FIELDS)[number]
)[];
void everyAnswerKeyFieldIsListed;
void nothingHarmlessIsListed;

/**
 * Accepts either a stored beat or one already typed as browser-safe, because the
 * point is to remove the answer key whether or not the type says it is there.
 */
export function beatForBrowser(beat: Beat | BrowserBeat): BrowserBeat {
  if (beat.kind !== "quiz") {
    return beat;
  }

  const forBrowser: Record<string, unknown> = { ...beat };
  for (const field of ANSWER_KEY_FIELDS) {
    delete forBrowser[field];
  }
  return forBrowser as BrowserBeat;
}

export function beatsForBrowser(
  beats: readonly (Beat | BrowserBeat)[],
): readonly BrowserBeat[] {
  return beats.map((beat) => beatForBrowser(beat));
}
