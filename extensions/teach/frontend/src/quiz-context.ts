import { createContext, useContext } from "react";

import type { QuizAnswerSubmission, QuizResult } from "../../shared/protocol.ts";

/**
 * How a quiz beat on screen reaches the lesson. Quiz beats are drawn in the middle
 * of the beat list, so answering travels in context rather than as props threaded
 * through every other beat kind.
 */
export interface QuizAnswering {
  readonly resultsByQuestionId: ReadonlyMap<string, QuizResult>;
  /** False while a turn is running, because an answer would be refused then. */
  readonly canAnswer: boolean;
  submitAnswer(questionId: string, submission: QuizAnswerSubmission): void;
}

const NO_ANSWERING: QuizAnswering = {
  resultsByQuestionId: new Map(),
  canAnswer: false,
  submitAnswer: () => {},
};

export const QuizAnsweringContext = createContext<QuizAnswering>(NO_ANSWERING);

export function useQuizAnswering(): QuizAnswering {
  return useContext(QuizAnsweringContext);
}
