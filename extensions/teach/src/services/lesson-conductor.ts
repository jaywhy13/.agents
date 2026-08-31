import type { LearnerSignalKind } from "../../shared/learner-history.ts";
import type { LessonSetup, LessonTranscript } from "../../shared/lesson.ts";
import type { QuizAnswerSubmission } from "../../shared/protocol.ts";

/**
 * Runs the teaching side of one lesson. The server layer talks only to this
 * interface, so the lesson page can be tested without a model.
 */
export interface LessonConductor {
  getTranscript(): Promise<LessonTranscript | null>;
  startLesson(setup: LessonSetup): Promise<void>;
  answerQuestion(questionId: string, text: string): Promise<void>;
  /** Grades what the learner chose or wrote, then teaches accordingly. */
  submitQuizAnswer(questionId: string, submission: QuizAnswerSubmission): Promise<void>;
  /** Defines words the learner highlighted, without disturbing the lesson. */
  requestDefinition(selectedText: string): Promise<void>;
  /** Asks the lesson for a question about what it has taught so far. */
  requestQuiz(): Promise<void>;
  /** Records what the learner asked for outright, and teaches accordingly. */
  recordLearnerSignal(signal: LearnerSignalKind): Promise<void>;
  continueLesson(): Promise<void>;
  /** Stops the current teaching turn at once. */
  interrupt(): Promise<void>;
  dispose(): Promise<void>;
}
