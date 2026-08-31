import { isGithubReferenceHostname } from "./github-hosts.ts";
import type { LearnerSignalKind } from "./learner-history.ts";
import { isLearnerSignalKind, LEARNER_SIGNALS } from "./learner-history.ts";
import type { LessonReference, LessonSetup, ReferenceKind } from "./lesson.ts";
import { isReferenceKind } from "./lesson.ts";
import type { LessonClientMessage, QuizAnswerSubmission } from "./protocol.ts";
import { InvalidClientMessageError } from "./protocol.ts";

export const MAXIMUM_TOPIC_CHARACTERS = 500;
export const MAXIMUM_LABEL_CHARACTERS = 120;
export const MAXIMUM_LINK_CHARACTERS = 2048;
export const MAXIMUM_PASTED_REFERENCE_CHARACTERS = 20_000;
export const MAXIMUM_REFERENCE_COUNT = 20;
export const MAXIMUM_ANSWER_CHARACTERS = 4_000;
/** A definition is about a term or a phrase, not about a whole paragraph. */
export const MAXIMUM_SELECTION_CHARACTERS = 200;
export const MAXIMUM_SELECTED_CHOICE_COUNT = 6;

const QUESTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CHOICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const ANSWER_FORMATS = ["multiple_choice", "short_text"] as const;

const ALLOWED_LINK_PROTOCOLS = ["http:", "https:"] as const;

/**
 * Everything the browser sends is untrusted input, even though the browser is on
 * the same machine. One explicit branch per message type so an unknown type can
 * never fall through to a handler.
 */
export function parseClientMessage(candidate: unknown): LessonClientMessage {
  const record = asRecord(candidate, "message");
  const type = record["type"];

  switch (type) {
    case "start_lesson":
      return { type: "start_lesson", setup: parseLessonSetup(record["setup"]) };
    case "answer":
      return {
        type: "answer",
        questionId: requireText(record["questionId"], "questionId", 200),
        text: requireText(record["text"], "text", MAXIMUM_ANSWER_CHARACTERS),
      };
    case "quiz_answer":
      return {
        type: "quiz_answer",
        questionId: requirePattern(record["questionId"], "questionId", QUESTION_ID_PATTERN),
        answer: parseQuizAnswerSubmission(record["answer"]),
      };
    case "define_selection":
      return {
        type: "define_selection",
        text: requireText(record["text"], "text", MAXIMUM_SELECTION_CHARACTERS),
      };
    case "request_quiz":
      return { type: "request_quiz" };
    case "learner_signal":
      return { type: "learner_signal", signal: requireLearnerSignal(record["signal"]) };
    case "continue":
      return { type: "continue" };
    case "interrupt":
      return { type: "interrupt" };
    default:
      throw new InvalidClientMessageError(`Unknown message type: ${describe(type)}`);
  }
}

/** One branch per answer format, so an unknown format can never reach grading. */
function parseQuizAnswerSubmission(candidate: unknown): QuizAnswerSubmission {
  const record = asRecord(candidate, "answer");
  const format = requireAnswerFormat(record["format"]);

  switch (format) {
    case "multiple_choice":
      return {
        format: "multiple_choice",
        selectedChoiceIds: parseSelectedChoiceIds(record["selectedChoiceIds"]),
      };
    case "short_text":
      return {
        format: "short_text",
        text: requireText(record["text"], "answer text", MAXIMUM_ANSWER_CHARACTERS),
      };
  }
}

function requireLearnerSignal(value: unknown): LearnerSignalKind {
  if (!isLearnerSignalKind(value)) {
    throw new InvalidClientMessageError(
      `A learner signal must be one of: ${LEARNER_SIGNALS.join(", ")}. Received ${describe(value)}.`,
    );
  }
  return value;
}

function requireAnswerFormat(value: unknown): (typeof ANSWER_FORMATS)[number] {
  if (typeof value !== "string" || !(ANSWER_FORMATS as readonly string[]).includes(value)) {
    throw new InvalidClientMessageError(`Unknown answer format: ${describe(value)}`);
  }
  return value as (typeof ANSWER_FORMATS)[number];
}

function parseSelectedChoiceIds(candidate: unknown): readonly string[] {
  if (!Array.isArray(candidate) || candidate.length === 0) {
    throw new InvalidClientMessageError("An answer must choose at least one of the choices.");
  }
  if (candidate.length > MAXIMUM_SELECTED_CHOICE_COUNT) {
    throw new InvalidClientMessageError(
      `An answer may choose at most ${MAXIMUM_SELECTED_CHOICE_COUNT} choices.`,
    );
  }
  return candidate.map((entry, index) =>
    requirePattern(entry, `selectedChoiceIds[${index}]`, CHOICE_ID_PATTERN),
  );
}

function requirePattern(value: unknown, fieldName: string, pattern: RegExp): string {
  const text = requireText(value, fieldName, 200);
  if (!pattern.test(text)) {
    throw new InvalidClientMessageError(`Field ${fieldName} is not in the expected shape.`);
  }
  return text;
}

export function parseLessonSetup(candidate: unknown): LessonSetup {
  const record = asRecord(candidate, "lesson setup");

  return {
    topic: requireText(record["topic"], "topic", MAXIMUM_TOPIC_CHARACTERS),
    references: parseReferenceList(record["references"]),
  };
}

function parseReferenceList(candidate: unknown): readonly LessonReference[] {
  if (candidate === undefined || candidate === null) {
    return [];
  }
  if (!Array.isArray(candidate)) {
    throw new InvalidClientMessageError("References must be a list.");
  }
  if (candidate.length > MAXIMUM_REFERENCE_COUNT) {
    throw new InvalidClientMessageError(
      `A lesson may use at most ${MAXIMUM_REFERENCE_COUNT} references.`,
    );
  }
  return candidate.map((entry, index) => parseReferenceEntry(entry, index));
}

function parseReferenceEntry(candidate: unknown, index: number): LessonReference {
  const record = asRecord(candidate, `reference ${index}`);
  const kind = record["kind"];
  if (!isReferenceKind(kind)) {
    throw new InvalidClientMessageError(`Reference ${index} has an unknown kind.`);
  }

  const label = requireText(record["label"], `reference ${index} label`, MAXIMUM_LABEL_CHARACTERS);
  return { kind, label, value: parseReferenceValue(kind, record["value"], index) };
}

function parseReferenceValue(kind: ReferenceKind, value: unknown, index: number): string {
  switch (kind) {
    case "url":
      return requireWebLink(value, `reference ${index}`);
    case "github":
      return requireGithubLink(value, `reference ${index}`);
    case "pasted":
      return requireText(
        value,
        `pasted reference ${index}`,
        MAXIMUM_PASTED_REFERENCE_CHARACTERS,
      );
  }
}

function requireWebLink(value: unknown, label: string): string {
  const text = requireText(value, `${label} link`, MAXIMUM_LINK_CHARACTERS);

  let parsedLink: URL;
  try {
    parsedLink = new URL(text);
  } catch {
    throw new InvalidClientMessageError(`${label} is not a web address.`);
  }

  if (!(ALLOWED_LINK_PROTOCOLS as readonly string[]).includes(parsedLink.protocol)) {
    throw new InvalidClientMessageError(`${label} must start with http:// or https://`);
  }

  return parsedLink.toString();
}

function requireGithubLink(value: unknown, label: string): string {
  const link = requireWebLink(value, label);

  if (!isGithubReferenceHostname(new URL(link).hostname)) {
    throw new InvalidClientMessageError(
      `${label} must be a github.com or gist.github.com address.`,
    );
  }

  return link;
}

function asRecord(candidate: unknown, label: string): Record<string, unknown> {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new InvalidClientMessageError(`Expected ${label} to be an object.`);
  }
  return candidate as Record<string, unknown>;
}

function requireText(value: unknown, fieldName: string, maximumCharacters: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidClientMessageError(`Field ${fieldName} must be non-blank text.`);
  }
  if (value.length > maximumCharacters) {
    throw new InvalidClientMessageError(
      `Field ${fieldName} must be at most ${maximumCharacters} characters.`,
    );
  }
  return value.trim();
}

function describe(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : typeof value;
}
