import type { BrowserBeat } from "./browser-beat.ts";
import type { LearnerSignalKind, QuizGrade } from "./learner-history.ts";
import type { LessonMetadata, LessonSetup } from "./lesson.ts";
import type { IllustrationProgress } from "./visuals/illustration-state.ts";

/** How the learner answered a quiz question, one shape per answer format. */
export type QuizAnswerSubmission =
  | {
      readonly format: "multiple_choice";
      readonly selectedChoiceIds: readonly string[];
    }
  | { readonly format: "short_text"; readonly text: string };

/** What the lesson tells the page once an answer has been graded. */
export interface QuizResult {
  readonly questionId: string;
  readonly grade: QuizGrade;
  readonly explanation: string;
  /** The choices that were right, for a multiple choice question. */
  readonly correctChoiceIds: readonly string[];
}

/** Messages the lesson server sends to the browser over the WebSocket. */
export type LessonServerMessage =
  | {
      readonly type: "lesson_state";
      readonly metadata: LessonMetadata;
      readonly beats: readonly BrowserBeat[];
      /** So a page that reloads still shows what its answers were marked as. */
      readonly quizResults: readonly QuizResult[];
      /** Where every picture in this lesson has got to, for a page that reconnects. */
      readonly illustrations: readonly IllustrationProgress[];
    }
  | { readonly type: "beat"; readonly beat: BrowserBeat }
  /** A picture has started, arrived, or failed. Sent after the image beat itself. */
  | { readonly type: "illustration"; readonly state: IllustrationProgress }
  | { readonly type: "question"; readonly questionId: string; readonly prompt: string }
  | { readonly type: "status"; readonly status: LessonMetadata["status"] }
  | { readonly type: "suggested_topic"; readonly topic: string }
  | { readonly type: "quiz_result"; readonly result: QuizResult }
  | { readonly type: "notice"; readonly level: "info" | "error"; readonly text: string };

/** Messages the browser sends to the lesson server over the WebSocket. */
export type LessonClientMessage =
  | { readonly type: "start_lesson"; readonly setup: LessonSetup }
  | { readonly type: "answer"; readonly questionId: string; readonly text: string }
  | {
      readonly type: "quiz_answer";
      readonly questionId: string;
      readonly answer: QuizAnswerSubmission;
    }
  /** The learner highlighted some words on the page and asked what they mean. */
  | { readonly type: "define_selection"; readonly text: string }
  /** The learner asked to be quizzed on what has been taught, there and then. */
  | { readonly type: "request_quiz" }
  /** The learner pressed Simpler or Go deeper. It is a request, not a guess. */
  | { readonly type: "learner_signal"; readonly signal: LearnerSignalKind }
  | { readonly type: "continue" }
  | { readonly type: "interrupt" };

export class InvalidClientMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidClientMessageError";
  }
}
