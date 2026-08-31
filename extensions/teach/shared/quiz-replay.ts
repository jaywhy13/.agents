import type { Beat, QuizBeat } from "./beat.ts";
import type { QuizAttempt } from "./learner-history.ts";
import type { QuizResult } from "./protocol.ts";

/**
 * Rebuilds what a page was told about every question the learner has answered.
 *
 * A page that reloads gets the beats back from the beat log, but a quiz beat says
 * nothing about how it was answered. The attempts hold that, so the two are put
 * back together here rather than in the page.
 */
export function quizResultsFromAttempts(
  beats: readonly Beat[],
  quizAttempts: readonly QuizAttempt[],
): readonly QuizResult[] {
  const quizBeatsByQuestionId = new Map<string, QuizBeat>();
  for (const beat of beats) {
    if (beat.kind === "quiz") {
      quizBeatsByQuestionId.set(beat.questionId, beat);
    }
  }

  const resultsByQuestionId = new Map<string, QuizResult>();
  for (const attempt of quizAttempts) {
    const quizBeat = quizBeatsByQuestionId.get(attempt.questionId);
    if (quizBeat === undefined) {
      continue;
    }
    // A question the lesson asked again is answered again, and the newest answer
    // is the one the learner is looking at.
    resultsByQuestionId.set(attempt.questionId, {
      questionId: attempt.questionId,
      grade: attempt.grade,
      explanation: attempt.explanation,
      correctChoiceIds:
        quizBeat.answerFormat === "multiple_choice" ? quizBeat.correctChoiceIds : [],
    });
  }

  return [...resultsByQuestionId.values()];
}
