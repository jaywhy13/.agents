import type { QuizAnswerFormat } from "./beat.ts";
import { QUIZ_ANSWER_FORMATS } from "./beat.ts";

/**
 * What the learner actually did: how they answered each question, how long they
 * stayed on each pause, and what they asked for outright. It is stored beside the
 * beats, and it is the only input the learner model is derived from, so the model
 * can be a pure function.
 */

export const QUIZ_GRADES = ["correct", "partly_correct", "incorrect"] as const;

export type QuizGrade = (typeof QUIZ_GRADES)[number];

/** Fixed answers are graded here; the learner's own words are graded by the agent. */
export const QUIZ_GRADERS = ["lesson_server", "teaching_agent"] as const;

export type QuizGrader = (typeof QUIZ_GRADERS)[number];

export interface QuizAttempt {
  readonly attemptId: string;
  readonly lessonId: string;
  readonly beatId: string;
  readonly questionId: string;
  readonly answerFormat: QuizAnswerFormat;
  /** What the learner sent, as text, whichever answer format was used. */
  readonly submittedAnswer: string;
  readonly selectedChoiceIds: readonly string[];
  readonly grade: QuizGrade;
  readonly gradedBy: QuizGrader;
  /**
   * The words the learner was shown about this grade. Stored because the teaching
   * agent writes its own explanation for a free text answer, so it exists nowhere
   * else and a page that reloads would otherwise lose it.
   */
  readonly explanation: string;
  /** Glossary terms the question tested, copied from the quiz beat. */
  readonly relatedTerms: readonly string[];
  readonly answeredAt: string;
}

/**
 * What the learner asked for in as many words.
 *
 * The other two signals are inferred: a grade says something about understanding, a
 * dwell says something about pace. Both are guesses, and a guess about how a person
 * feels is the wrong thing to build teaching on. These two are not guesses — the
 * learner pressed a button that says exactly this — so they are stored in their own
 * right and they outrank the inferences.
 */
export const LEARNER_SIGNALS = ["simpler", "go_deeper"] as const;

export type LearnerSignalKind = (typeof LEARNER_SIGNALS)[number];

export interface LearnerSignal {
  readonly lessonId: string;
  readonly signal: LearnerSignalKind;
  readonly askedAt: string;
}

export function isLearnerSignalKind(candidate: unknown): candidate is LearnerSignalKind {
  return typeof candidate === "string" && (LEARNER_SIGNALS as readonly string[]).includes(candidate);
}

export interface PauseDwell {
  readonly lessonId: string;
  readonly beatId: string;
  readonly suggestedWaitSeconds: number;
  /** How long the learner actually stayed before asking for more. */
  readonly actualWaitSeconds: number;
  readonly resumedAt: string;
}

export class InvalidLearnerHistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidLearnerHistoryError";
  }
}

export function parseQuizAttempt(candidate: unknown): QuizAttempt {
  const record = asRecord(candidate, "quiz attempt");

  return {
    attemptId: requireText(record["attemptId"], "attemptId"),
    lessonId: requireText(record["lessonId"], "lessonId"),
    beatId: requireText(record["beatId"], "beatId"),
    questionId: requireText(record["questionId"], "questionId"),
    answerFormat: requireOneOf(record["answerFormat"], "answerFormat", QUIZ_ANSWER_FORMATS),
    submittedAnswer: requireText(record["submittedAnswer"], "submittedAnswer"),
    selectedChoiceIds: requireTextList(record["selectedChoiceIds"], "selectedChoiceIds"),
    grade: requireOneOf(record["grade"], "grade", QUIZ_GRADES),
    gradedBy: requireOneOf(record["gradedBy"], "gradedBy", QUIZ_GRADERS),
    explanation: requireText(record["explanation"], "explanation"),
    relatedTerms: requireTextList(record["relatedTerms"], "relatedTerms"),
    answeredAt: requireText(record["answeredAt"], "answeredAt"),
  };
}

export function parsePauseDwell(candidate: unknown): PauseDwell {
  const record = asRecord(candidate, "pause dwell");

  return {
    lessonId: requireText(record["lessonId"], "lessonId"),
    beatId: requireText(record["beatId"], "beatId"),
    suggestedWaitSeconds: requireCount(record["suggestedWaitSeconds"], "suggestedWaitSeconds"),
    actualWaitSeconds: requireCount(record["actualWaitSeconds"], "actualWaitSeconds"),
    resumedAt: requireText(record["resumedAt"], "resumedAt"),
  };
}

export function parseLearnerSignal(candidate: unknown): LearnerSignal {
  const record = asRecord(candidate, "learner signal");

  return {
    lessonId: requireText(record["lessonId"], "lessonId"),
    signal: requireOneOf(record["signal"], "signal", LEARNER_SIGNALS),
    askedAt: requireText(record["askedAt"], "askedAt"),
  };
}

function asRecord(candidate: unknown, label: string): Record<string, unknown> {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new InvalidLearnerHistoryError(`Expected ${label} to be an object.`);
  }
  return candidate as Record<string, unknown>;
}

function requireText(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidLearnerHistoryError(`Field ${fieldName} must be non-blank text.`);
  }
  return value;
}

function requireTextList(value: unknown, fieldName: string): readonly string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new InvalidLearnerHistoryError(`Field ${fieldName} must be a list.`);
  }
  return value.map((entry, index) => requireText(entry, `${fieldName}[${index}]`));
}

function requireCount(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new InvalidLearnerHistoryError(`Field ${fieldName} must be zero or more.`);
  }
  return value;
}

function requireOneOf<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new InvalidLearnerHistoryError(
      `Field ${fieldName} must be one of: ${allowed.join(", ")}.`,
    );
  }
  return value as T;
}
