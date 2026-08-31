import type { Beat } from "./beat.ts";
import type { QuizAttempt } from "./learner-history.ts";
import type { IllustrationProgress } from "./visuals/illustration-state.ts";

export const LESSON_STATUSES = ["setup", "teaching", "paused", "finished", "aborted"] as const;

export type LessonStatus = (typeof LESSON_STATUSES)[number];

export const REFERENCE_KINDS = ["url", "github", "pasted"] as const;

export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export interface LessonReference {
  readonly kind: ReferenceKind;
  readonly label: string;
  readonly value: string;
}

/** What the learner filled in on the setup form before the lesson starts. */
export interface LessonSetup {
  readonly topic: string;
  readonly references: readonly LessonReference[];
}

export interface LessonMetadata {
  readonly lessonId: string;
  readonly topic: string;
  readonly status: LessonStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly references: readonly LessonReference[];
  readonly beatCount: number;
}

export interface LessonTranscript {
  readonly metadata: LessonMetadata;
  readonly beats: readonly Beat[];
  /** How the learner answered every question the lesson asked. */
  readonly quizAttempts: readonly QuizAttempt[];
  /**
   * Where every picture in this lesson has got to. An image beat says what was
   * asked for; a picture takes seconds to draw and can fail, so how it went is kept
   * beside the beats and replayed to a page that reconnects.
   */
  readonly illustrations: readonly IllustrationProgress[];
}

export class InvalidLessonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidLessonError";
  }
}

const LESSON_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * Lesson identifiers become directory names, so anything that could climb out of
 * the lessons directory is refused before it reaches the filesystem.
 */
export function requireLessonId(candidate: unknown): string {
  if (typeof candidate !== "string" || !LESSON_ID_PATTERN.test(candidate)) {
    throw new InvalidLessonError(
      "A lesson id must be 1 to 64 characters of letters, digits, hyphen or underscore.",
    );
  }
  return candidate;
}

export function isLessonStatus(candidate: unknown): candidate is LessonStatus {
  return (
    typeof candidate === "string" && (LESSON_STATUSES as readonly string[]).includes(candidate)
  );
}

export function isReferenceKind(candidate: unknown): candidate is ReferenceKind {
  return (
    typeof candidate === "string" && (REFERENCE_KINDS as readonly string[]).includes(candidate)
  );
}

export function parseLessonMetadata(candidate: unknown): LessonMetadata {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new InvalidLessonError("Lesson metadata must be an object.");
  }
  const record = candidate as Record<string, unknown>;

  const status = record["status"];
  if (!isLessonStatus(status)) {
    throw new InvalidLessonError(`Unknown lesson status: ${String(status)}`);
  }

  return {
    lessonId: requireLessonId(record["lessonId"]),
    topic: requireText(record["topic"], "topic"),
    status,
    createdAt: requireText(record["createdAt"], "createdAt"),
    updatedAt: requireText(record["updatedAt"], "updatedAt"),
    references: parseReferences(record["references"]),
    beatCount: requireCount(record["beatCount"], "beatCount"),
  };
}

export function parseReferences(candidate: unknown): readonly LessonReference[] {
  if (candidate === undefined || candidate === null) {
    return [];
  }
  if (!Array.isArray(candidate)) {
    throw new InvalidLessonError("References must be a list.");
  }
  return candidate.map((entry, index) => parseReference(entry, index));
}

function parseReference(candidate: unknown, index: number): LessonReference {
  if (typeof candidate !== "object" || candidate === null) {
    throw new InvalidLessonError(`Reference ${index} must be an object.`);
  }
  const record = candidate as Record<string, unknown>;
  const kind = record["kind"];
  if (!isReferenceKind(kind)) {
    throw new InvalidLessonError(`Reference ${index} has an unknown kind: ${String(kind)}`);
  }
  return {
    kind,
    label: requireText(record["label"], `references[${index}].label`),
    value: requireText(record["value"], `references[${index}].value`),
  };
}

function requireText(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidLessonError(`Field ${fieldName} must be non-blank text.`);
  }
  return value;
}

function requireCount(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new InvalidLessonError(`Field ${fieldName} must be an integer of 0 or more.`);
  }
  return value;
}
