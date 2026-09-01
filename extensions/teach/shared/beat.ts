/**
 * A lesson is a sequence of beats. A beat is the smallest unit the learner sees:
 * exactly one idea, plus the narration that goes with it.
 *
 * Every planned beat kind is reserved here so the wire format, the storage format
 * and the frontend switch statements are all written against the final list. A
 * reserved kind that is not built yet raises an explicit error.
 */

import {
  asBeatRecord,
  InvalidBeatError,
  optionalText,
  requireBoolean,
  requireIntegerInRange,
  requireIsoTimestamp,
  requireList,
  requireMemberOf,
  requireNonBlankText,
  requireNonEmptyTextList,
  requirePositiveInteger,
  requireTextList,
} from "./beat-fields.ts";
import type { IllustrationRequest } from "./visuals/illustration-request.ts";
import {
  InvalidIllustrationError,
  parseIllustrationRequest,
} from "./visuals/illustration-request.ts";
import { InvalidGraphDiagramError } from "./visuals/diagram-spec-fields.ts";
import type { GraphDiagramSpec } from "./visuals/graph-diagram-spec.ts";
import { parseGraphDiagramSpec } from "./visuals/graph-diagram-spec.ts";

export { InvalidBeatError } from "./beat-fields.ts";

export const BEAT_KINDS = [
  "concept_card",
  "definition",
  "code",
  "diagram",
  "image",
  "quiz",
  "pause",
  "narration",
  "lesson_end",
] as const;

export type BeatKind = (typeof BEAT_KINDS)[number];

export const QUIZ_ANSWER_FORMATS = ["multiple_choice", "short_text"] as const;

export type QuizAnswerFormat = (typeof QUIZ_ANSWER_FORMATS)[number];

/** A lesson that asks the learner to wait longer than this is not pausing. */
export const LONGEST_SUGGESTED_WAIT_SECONDS = 600;

const SMALLEST_CHOICE_COUNT = 2;
const LARGEST_CHOICE_COUNT = 6;
const LONGEST_CODE_CHARACTERS = 20_000;
const LANGUAGE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9+#._-]{0,29}$/;
const QUESTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CHOICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
/** A content hash, so the id can be a file name and can never be a path. */
const ILLUSTRATION_ID_PATTERN = /^[a-f0-9]{64}$/;

/**
 * What the later speech step is allowed to know about a run of narration. A term
 * can be said more slowly, an emphasis more strongly; everything else is a plain
 * sentence.
 */
export const NARRATION_CHUNK_KINDS = ["sentence", "emphasis", "term"] as const;

export type NarrationChunkKind = (typeof NARRATION_CHUNK_KINDS)[number];

export interface NarrationChunk {
  readonly kind: NarrationChunkKind;
  readonly text: string;
}

export interface BeatEnvelope {
  readonly beatId: string;
  readonly lessonId: string;
  readonly sequenceNumber: number;
  readonly createdAt: string;
}

export interface ConceptCardBeat extends BeatEnvelope {
  readonly kind: "concept_card";
  readonly title: string;
  readonly plainLanguageSummary: string;
  readonly keyPoints: readonly string[];
  readonly narrationScript: string;
  /** True when the lesson should stop and wait for the learner before the next beat. */
  readonly pauseForLearner: boolean;
}

/**
 * One word the learner now owns. Definitions build up the glossary panel, and the
 * glossary is what the term highlighting in prose is matched against.
 */
export interface DefinitionBeat extends BeatEnvelope {
  readonly kind: "definition";
  readonly term: string;
  /** The term written out in full when the term is an acronym, otherwise null. */
  readonly fullForm: string | null;
  readonly plainLanguageMeaning: string;
  readonly example: string | null;
}

/** One run of lines the lesson wants the learner to look at, counted from one. */
export interface CodeLineRange {
  readonly startLine: number;
  readonly endLine: number;
}

export interface CodeBeat extends BeatEnvelope {
  readonly kind: "code";
  /** What the code is written in, so the page can highlight it. */
  readonly language: string;
  readonly fileName: string | null;
  readonly code: string;
  readonly explanation: string;
  readonly emphasizedLineRanges: readonly CodeLineRange[];
}

export interface QuizChoice {
  readonly choiceId: string;
  readonly text: string;
}

interface QuizBeatShape extends BeatEnvelope {
  readonly kind: "quiz";
  /** Stable across the whole lesson, so an answer names the question it answers. */
  readonly questionId: string;
  readonly question: string;
  /** Shown once the learner has answered. */
  readonly explanation: string;
  /** Glossary terms this question tests. The learner model tracks these. */
  readonly relatedTerms: readonly string[];
}

/** Graded by the lesson server itself, because the answer is a fixed set. */
export interface MultipleChoiceQuizBeat extends QuizBeatShape {
  readonly answerFormat: "multiple_choice";
  readonly choices: readonly QuizChoice[];
  readonly correctChoiceIds: readonly string[];
}

/** Graded by the teaching agent, because the answer is the learner's own words. */
export interface ShortTextQuizBeat extends QuizBeatShape {
  readonly answerFormat: "short_text";
  readonly correctAnswerCriteria: string;
}

export type QuizBeat = MultipleChoiceQuizBeat | ShortTextQuizBeat;

/**
 * The lesson stopping on purpose. A pause ends the teaching turn: the lesson waits
 * for the learner rather than holding a tool call open.
 */
export interface PauseBeat extends BeatEnvelope {
  readonly kind: "pause";
  readonly reason: string;
  readonly suggestedWaitSeconds: number;
}

export interface LessonEndBeat extends BeatEnvelope {
  readonly kind: "lesson_end";
  readonly recap: string;
  readonly masteredConcepts: readonly string[];
  readonly suggestedNextTopics: readonly string[];
}

/**
 * A picture of the shape of an idea, described by what it means rather than by what
 * it looks like. The lesson supplies parts and how they join; the compiler decides
 * every coordinate and colour, so the same description always draws the same
 * picture and the lesson cannot draw something ugly.
 */
export interface DiagramBeat extends BeatEnvelope {
  readonly kind: "diagram";
  readonly spec: GraphDiagramSpec;
}

/**
 * A drawn illustration. The beat carries what was asked for and the content hash of
 * that request; the bytes live on the learner's own disk and the page asks the
 * lesson server for them by that hash. Where the picture has got to travels
 * separately, because making one takes seconds and can fail.
 */
export interface ImageBeat extends BeatEnvelope {
  readonly kind: "image";
  readonly request: IllustrationRequest;
  readonly illustrationId: string;
}

/**
 * The words that go with another beat, already cut into chunks for the speech step
 * that comes later. Narration is never drawn on screen: it is what the lesson
 * would say out loud about the beat it names.
 */
export interface NarrationBeat extends BeatEnvelope {
  readonly kind: "narration";
  /** The beat these words speak. */
  readonly relatedBeatId: string;
  readonly chunks: readonly NarrationChunk[];
}

/** Widens to a union as each reserved kind is implemented. */
export type Beat =
  | ConceptCardBeat
  | DefinitionBeat
  | CodeBeat
  | DiagramBeat
  | ImageBeat
  | QuizBeat
  | PauseBeat
  | NarrationBeat
  | LessonEndBeat;

export function isBeatKind(candidate: unknown): candidate is BeatKind {
  return typeof candidate === "string" && (BEAT_KINDS as readonly string[]).includes(candidate);
}

/**
 * One explicit branch per beat kind so adding a kind cannot silently fall through
 * to a generic handler.
 */
export function parseBeat(candidate: unknown): Beat {
  const record = asBeatRecord(candidate, "beat");
  const kind = record["kind"];

  if (!isBeatKind(kind)) {
    throw new InvalidBeatError(`Unknown beat kind: ${describe(kind)}`);
  }

  switch (kind) {
    case "concept_card":
      return parseConceptCardBeat(record);
    case "definition":
      return parseDefinitionBeat(record);
    case "narration":
      return parseNarrationBeat(record);
    case "code":
      return parseCodeBeat(record);
    case "diagram":
      return parseDiagramBeat(record);
    case "image":
      return parseImageBeat(record);
    case "quiz":
      return parseQuizBeat(record);
    case "pause":
      return parsePauseBeat(record);
    case "lesson_end":
      return parseLessonEndBeat(record);
  }
}

/**
 * The diagram's own checks live with the diagram, so the field name and the reason
 * come from there. They are re-raised as a beat problem, because that is what the
 * caller of `parseBeat` is prepared to handle, and the wording is kept so the
 * teaching model can correct itself.
 */
export function parseDiagramBeat(candidate: unknown): DiagramBeat {
  const record = asBeatRecord(candidate, "diagram beat");

  let spec: GraphDiagramSpec;
  try {
    spec = parseGraphDiagramSpec(record["spec"]);
  } catch (cause) {
    if (cause instanceof InvalidGraphDiagramError) {
      throw new InvalidBeatError(cause.message);
    }
    throw cause;
  }

  return { kind: "diagram", ...parseBeatEnvelope(record), spec };
}

export function parseImageBeat(candidate: unknown): ImageBeat {
  const record = asBeatRecord(candidate, "image beat");

  let request: IllustrationRequest;
  try {
    request = parseIllustrationRequest(record["request"]);
  } catch (cause) {
    if (cause instanceof InvalidIllustrationError) {
      throw new InvalidBeatError(cause.message);
    }
    throw cause;
  }

  return {
    kind: "image",
    ...parseBeatEnvelope(record),
    request,
    illustrationId: requirePattern(
      record["illustrationId"],
      "illustrationId",
      ILLUSTRATION_ID_PATTERN,
    ),
  };
}

export function parseConceptCardBeat(candidate: unknown): ConceptCardBeat {
  const record = asBeatRecord(candidate, "concept card beat");

  return {
    kind: "concept_card",
    ...parseBeatEnvelope(record),
    title: requireNonBlankText(record["title"], "title"),
    plainLanguageSummary: requireNonBlankText(
      record["plainLanguageSummary"],
      "plainLanguageSummary",
    ),
    keyPoints: requireNonEmptyTextList(record["keyPoints"], "keyPoints"),
    narrationScript: requireNonBlankText(record["narrationScript"], "narrationScript"),
    pauseForLearner: requireBoolean(record["pauseForLearner"], "pauseForLearner"),
  };
}

export function parseDefinitionBeat(candidate: unknown): DefinitionBeat {
  const record = asBeatRecord(candidate, "definition beat");

  return {
    kind: "definition",
    ...parseBeatEnvelope(record),
    term: requireNonBlankText(record["term"], "term"),
    fullForm: optionalText(record["fullForm"], "fullForm"),
    plainLanguageMeaning: requireNonBlankText(
      record["plainLanguageMeaning"],
      "plainLanguageMeaning",
    ),
    example: optionalText(record["example"], "example"),
  };
}

export function parseCodeBeat(candidate: unknown): CodeBeat {
  const record = asBeatRecord(candidate, "code beat");
  const code = requireCode(record["code"]);

  return {
    kind: "code",
    ...parseBeatEnvelope(record),
    language: requireLanguageName(record["language"]),
    fileName: optionalText(record["fileName"], "fileName"),
    code,
    explanation: requireNonBlankText(record["explanation"], "explanation"),
    emphasizedLineRanges: parseCodeLineRanges(record["emphasizedLineRanges"], lineCount(code)),
  };
}

export function parseQuizBeat(candidate: unknown): QuizBeat {
  const record = asBeatRecord(candidate, "quiz beat");
  const answerFormat = requireMemberOf(
    record["answerFormat"],
    "answerFormat",
    QUIZ_ANSWER_FORMATS,
  );
  const shape: QuizBeatShape = {
    kind: "quiz",
    ...parseBeatEnvelope(record),
    questionId: requirePattern(record["questionId"], "questionId", QUESTION_ID_PATTERN),
    question: requireNonBlankText(record["question"], "question"),
    explanation: requireNonBlankText(record["explanation"], "explanation"),
    relatedTerms: requireTextList(record["relatedTerms"], "relatedTerms"),
  };

  switch (answerFormat) {
    case "multiple_choice": {
      const choices = parseQuizChoices(record["choices"]);
      return {
        ...shape,
        answerFormat,
        choices,
        correctChoiceIds: parseCorrectChoiceIds(record["correctChoiceIds"], choices),
      };
    }
    case "short_text":
      return {
        ...shape,
        answerFormat,
        correctAnswerCriteria: requireNonBlankText(
          record["correctAnswerCriteria"],
          "correctAnswerCriteria",
        ),
      };
  }
}

export function parsePauseBeat(candidate: unknown): PauseBeat {
  const record = asBeatRecord(candidate, "pause beat");

  return {
    kind: "pause",
    ...parseBeatEnvelope(record),
    reason: requireNonBlankText(record["reason"], "reason"),
    suggestedWaitSeconds: requireIntegerInRange(
      record["suggestedWaitSeconds"],
      "suggestedWaitSeconds",
      1,
      LONGEST_SUGGESTED_WAIT_SECONDS,
    ),
  };
}

export function parseLessonEndBeat(candidate: unknown): LessonEndBeat {
  const record = asBeatRecord(candidate, "lesson end beat");

  return {
    kind: "lesson_end",
    ...parseBeatEnvelope(record),
    recap: requireNonBlankText(record["recap"], "recap"),
    masteredConcepts: requireTextList(record["masteredConcepts"], "masteredConcepts"),
    suggestedNextTopics: requireTextList(record["suggestedNextTopics"], "suggestedNextTopics"),
  };
}

export function parseNarrationBeat(candidate: unknown): NarrationBeat {
  const record = asBeatRecord(candidate, "narration beat");

  return {
    kind: "narration",
    ...parseBeatEnvelope(record),
    relatedBeatId: requireNonBlankText(record["relatedBeatId"], "relatedBeatId"),
    chunks: parseNarrationChunks(record["chunks"]),
  };
}

export function parseNarrationChunks(candidate: unknown): readonly NarrationChunk[] {
  const entries = requireList(candidate, "chunks");
  if (entries.length === 0) {
    throw new InvalidBeatError("Field chunks must list at least one chunk.");
  }

  return entries.map((entry, index) => {
    const record = asBeatRecord(entry, `chunks[${index}]`);
    return {
      kind: requireMemberOf(record["kind"], `chunks[${index}].kind`, NARRATION_CHUNK_KINDS),
      text: requireNonBlankText(record["text"], `chunks[${index}].text`),
    };
  });
}

function parseQuizChoices(candidate: unknown): readonly QuizChoice[] {
  const entries = requireList(candidate, "choices");
  if (entries.length < SMALLEST_CHOICE_COUNT || entries.length > LARGEST_CHOICE_COUNT) {
    throw new InvalidBeatError(
      `Field choices must list ${SMALLEST_CHOICE_COUNT} to ${LARGEST_CHOICE_COUNT} choices.`,
    );
  }

  const choices: QuizChoice[] = [];
  const seenChoiceIds = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const record = asBeatRecord(entry, `choices[${index}]`);
    const choiceId = requirePattern(
      record["choiceId"],
      `choices[${index}].choiceId`,
      CHOICE_ID_PATTERN,
    );
    if (seenChoiceIds.has(choiceId)) {
      throw new InvalidBeatError(`Field choices[${index}].choiceId repeats "${choiceId}".`);
    }
    seenChoiceIds.add(choiceId);
    choices.push({ choiceId, text: requireNonBlankText(record["text"], `choices[${index}].text`) });
  }
  return choices;
}

function parseCorrectChoiceIds(
  candidate: unknown,
  choices: readonly QuizChoice[],
): readonly string[] {
  const correctChoiceIds = requireTextList(candidate, "correctChoiceIds");
  if (correctChoiceIds.length === 0) {
    throw new InvalidBeatError("Field correctChoiceIds must name at least one choice.");
  }

  const offeredChoiceIds = new Set(choices.map((choice) => choice.choiceId));
  const seen = new Set<string>();
  for (const choiceId of correctChoiceIds) {
    if (!offeredChoiceIds.has(choiceId)) {
      throw new InvalidBeatError(`Field correctChoiceIds names "${choiceId}", which is not a choice.`);
    }
    if (seen.has(choiceId)) {
      throw new InvalidBeatError(`Field correctChoiceIds repeats "${choiceId}".`);
    }
    seen.add(choiceId);
  }
  return correctChoiceIds;
}

function parseCodeLineRanges(candidate: unknown, availableLines: number): readonly CodeLineRange[] {
  return requireList(candidate, "emphasizedLineRanges").map((entry, index) => {
    const record = asBeatRecord(entry, `emphasizedLineRanges[${index}]`);
    const startLine = requireIntegerInRange(
      record["startLine"],
      `emphasizedLineRanges[${index}].startLine`,
      1,
      availableLines,
    );
    return {
      startLine,
      endLine: requireIntegerInRange(
        record["endLine"],
        `emphasizedLineRanges[${index}].endLine`,
        startLine,
        availableLines,
      ),
    };
  });
}

function requireCode(value: unknown): string {
  const code = requireNonBlankText(value, "code");
  if (code.length > LONGEST_CODE_CHARACTERS) {
    throw new InvalidBeatError(
      `Field code must be at most ${LONGEST_CODE_CHARACTERS} characters. Teach it in smaller pieces.`,
    );
  }
  return code;
}

function requireLanguageName(value: unknown): string {
  return requirePattern(value, "language", LANGUAGE_NAME_PATTERN);
}

function requirePattern(value: unknown, fieldName: string, pattern: RegExp): string {
  const text = requireNonBlankText(value, fieldName);
  if (!pattern.test(text)) {
    throw new InvalidBeatError(`Field ${fieldName} is not in the shape ${String(pattern)}.`);
  }
  return text;
}

function lineCount(code: string): number {
  return code.split("\n").length;
}

function parseBeatEnvelope(record: Record<string, unknown>): BeatEnvelope {
  return {
    beatId: requireNonBlankText(record["beatId"], "beatId"),
    lessonId: requireNonBlankText(record["lessonId"], "lessonId"),
    sequenceNumber: requirePositiveInteger(record["sequenceNumber"], "sequenceNumber"),
    createdAt: requireIsoTimestamp(record["createdAt"], "createdAt"),
  };
}

function describe(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null) return "null";
  return typeof value;
}
