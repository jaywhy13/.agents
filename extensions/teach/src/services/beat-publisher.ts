import { randomUUID } from "node:crypto";

import type {
  Beat,
  CodeBeat,
  CodeLineRange,
  ConceptCardBeat,
  DefinitionBeat,
  DiagramBeat,
  ImageBeat,
  LessonEndBeat,
  NarrationBeat,
  NarrationChunk,
  PauseBeat,
  QuizBeat,
  QuizChoice,
} from "../../shared/beat.ts";
import {
  parseCodeBeat,
  parseConceptCardBeat,
  parseDefinitionBeat,
  parseDiagramBeat,
  parseImageBeat,
  parseLessonEndBeat,
  parseNarrationBeat,
  parsePauseBeat,
  parseQuizBeat,
} from "../../shared/beat.ts";
import type { IllustrationRequest } from "../../shared/visuals/illustration-request.ts";
import type { BeatBroadcaster } from "./beat-broadcaster.ts";
import type { LessonRepository } from "./lesson-repository.ts";

/** What the teaching model supplies when it teaches one idea. */
export interface ConceptCardRequest {
  readonly title: string;
  readonly plainLanguageSummary: string;
  readonly keyPoints: readonly string[];
  readonly narrationScript: string;
  readonly pauseForLearner: boolean;
}

/**
 * Every beat the model can teach may carry the words that go with it. They are
 * published as a narration beat tied to the beat they speak, so the later speech
 * step has one place to look and the shown beat stays about what is on screen.
 */
export interface NarratedRequest {
  readonly narration: readonly NarrationChunk[];
}

export interface DefinitionRequest extends NarratedRequest {
  readonly term: string;
  readonly fullForm: string | null;
  readonly plainLanguageMeaning: string;
  readonly example: string | null;
}

export interface CodeRequest extends NarratedRequest {
  readonly language: string;
  readonly fileName: string | null;
  readonly code: string;
  readonly explanation: string;
  readonly emphasizedLineRanges: readonly CodeLineRange[];
}

export interface DiagramRequest extends NarratedRequest {
  /** Already checked, so the publisher never has to know the diagram's rules. */
  readonly spec: unknown;
}

export interface ImageRequest extends NarratedRequest {
  readonly illustration: IllustrationRequest;
  /** The content hash of the illustration request. The page asks for bytes by it. */
  readonly illustrationId: string;
}

interface QuizRequestShape extends NarratedRequest {
  readonly questionId: string;
  readonly question: string;
  readonly explanation: string;
  readonly relatedTerms: readonly string[];
}

export interface MultipleChoiceQuizRequest extends QuizRequestShape {
  readonly answerFormat: "multiple_choice";
  readonly choices: readonly QuizChoice[];
  readonly correctChoiceIds: readonly string[];
}

export interface ShortTextQuizRequest extends QuizRequestShape {
  readonly answerFormat: "short_text";
  readonly correctAnswerCriteria: string;
}

export type QuizRequest = MultipleChoiceQuizRequest | ShortTextQuizRequest;

export interface PauseRequest extends NarratedRequest {
  readonly reason: string;
  readonly suggestedWaitSeconds: number;
}

export interface LessonEndRequest extends NarratedRequest {
  readonly recap: string;
  readonly masteredConcepts: readonly string[];
  readonly suggestedNextTopics: readonly string[];
}

/**
 * Raised when the model tries to teach another idea in a turn that has already
 * paused. A pause hands the lesson back to the learner, so anything after it in
 * the same turn would appear while the learner is not looking.
 */
export class LessonAlreadyPausedError extends Error {
  constructor() {
    super(
      "This turn has already paused for the learner. End the turn now and wait for the learner.",
    );
    this.name = "LessonAlreadyPausedError";
  }
}

export interface BeatPublisherOptions {
  readonly lessonId: string;
  readonly lessonRepository: LessonRepository;
  readonly beatBroadcaster: BeatBroadcaster;
  readonly startingBeatCount: number;
  readonly now?: () => Date;
  readonly createBeatId?: () => string;
}

/**
 * Turns a teaching request into a stored, numbered, broadcast beat. Validation
 * happens before anything is written, so a rejected beat leaves no trace in the
 * append-only log.
 */
export class BeatPublisher {
  private readonly lessonId: string;
  private readonly lessonRepository: LessonRepository;
  private readonly beatBroadcaster: BeatBroadcaster;
  private readonly now: () => Date;
  private readonly createBeatId: () => string;
  private publishedBeatCount: number;
  private pausedThisTurn = false;

  constructor(options: BeatPublisherOptions) {
    this.lessonId = options.lessonId;
    this.lessonRepository = options.lessonRepository;
    this.beatBroadcaster = options.beatBroadcaster;
    this.now = options.now ?? (() => new Date());
    this.createBeatId = options.createBeatId ?? (() => randomUUID());
    this.publishedBeatCount = options.startingBeatCount;
  }

  /** Called at the start of every teaching turn, which clears the pause guard. */
  beginTurn(): void {
    this.pausedThisTurn = false;
  }

  get hasPausedThisTurn(): boolean {
    return this.pausedThisTurn;
  }

  async publishConceptCard(request: ConceptCardRequest): Promise<ConceptCardBeat> {
    return this.publishTeachingBeat((envelope) =>
      parseConceptCardBeat({
        kind: "concept_card",
        ...envelope,
        title: request.title,
        plainLanguageSummary: request.plainLanguageSummary,
        keyPoints: request.keyPoints,
        narrationScript: request.narrationScript,
        pauseForLearner: request.pauseForLearner,
      }),
    );
  }

  async publishDefinition(request: DefinitionRequest): Promise<DefinitionBeat> {
    return this.publishNarratedBeat(request, (envelope) =>
      parseDefinitionBeat({
        kind: "definition",
        ...envelope,
        term: request.term,
        fullForm: request.fullForm,
        plainLanguageMeaning: request.plainLanguageMeaning,
        example: request.example,
      }),
    );
  }

  async publishCode(request: CodeRequest): Promise<CodeBeat> {
    return this.publishNarratedBeat(request, (envelope) =>
      parseCodeBeat({
        kind: "code",
        ...envelope,
        language: request.language,
        fileName: request.fileName,
        code: request.code,
        explanation: request.explanation,
        emphasizedLineRanges: request.emphasizedLineRanges,
      }),
    );
  }

  async publishDiagram(request: DiagramRequest): Promise<DiagramBeat> {
    return this.publishNarratedBeat(request, (envelope) =>
      parseDiagramBeat({ kind: "diagram", ...envelope, spec: request.spec }),
    );
  }

  /**
   * Publishes the picture the lesson asked for, not the picture itself. Drawing takes
   * seconds and can fail, so the beat says what was asked for and where to find the
   * bytes, and how the drawing went arrives separately.
   */
  async publishImage(request: ImageRequest): Promise<ImageBeat> {
    return this.publishNarratedBeat(request, (envelope) =>
      parseImageBeat({
        kind: "image",
        ...envelope,
        request: request.illustration,
        illustrationId: request.illustrationId,
      }),
    );
  }

  async publishQuiz(request: QuizRequest): Promise<QuizBeat> {
    return this.publishNarratedBeat(request, (envelope) =>
      parseQuizBeat({ kind: "quiz", ...envelope, ...quizFieldsOf(request) }),
    );
  }

  /**
   * A pause is the last beat of its turn. The turn ends after it, so the learner
   * is never shown something new while they are away from the screen.
   */
  async publishPause(request: PauseRequest): Promise<PauseBeat> {
    const beat = await this.publishNarratedBeat(request, (envelope) =>
      parsePauseBeat({
        kind: "pause",
        ...envelope,
        reason: request.reason,
        suggestedWaitSeconds: request.suggestedWaitSeconds,
      }),
    );
    this.pausedThisTurn = true;
    return beat;
  }

  async publishLessonEnd(request: LessonEndRequest): Promise<LessonEndBeat> {
    return this.publishNarratedBeat(request, (envelope) =>
      parseLessonEndBeat({
        kind: "lesson_end",
        ...envelope,
        recap: request.recap,
        masteredConcepts: request.masteredConcepts,
        suggestedNextTopics: request.suggestedNextTopics,
      }),
    );
  }

  private async publishNarratedBeat<T extends Beat>(
    request: NarratedRequest,
    buildBeat: (envelope: BeatEnvelopeFields) => T,
  ): Promise<T> {
    const beat = await this.publishTeachingBeat(buildBeat);
    if (request.narration.length > 0) {
      await this.publishNarration(beat.beatId, request.narration);
    }
    return beat;
  }

  private async publishNarration(
    relatedBeatId: string,
    chunks: readonly NarrationChunk[],
  ): Promise<NarrationBeat> {
    // Narration is not a new idea, so it is allowed after a pause: it is the words
    // for the beat the learner is already looking at.
    return this.publishBeat((envelope) =>
      parseNarrationBeat({ kind: "narration", ...envelope, relatedBeatId, chunks }),
    );
  }

  private async publishTeachingBeat<T extends Beat>(
    buildBeat: (envelope: BeatEnvelopeFields) => T,
  ): Promise<T> {
    if (this.pausedThisTurn) {
      throw new LessonAlreadyPausedError();
    }
    return this.publishBeat(buildBeat);
  }

  private async publishBeat<T extends Beat>(
    buildBeat: (envelope: BeatEnvelopeFields) => T,
  ): Promise<T> {
    const timestamp = this.now().toISOString();
    const beat = buildBeat({
      beatId: this.createBeatId(),
      lessonId: this.lessonId,
      sequenceNumber: this.publishedBeatCount + 1,
      createdAt: timestamp,
    });

    await this.lessonRepository.appendBeat(this.lessonId, beat);
    this.publishedBeatCount = beat.sequenceNumber;
    await this.recordLessonProgress(timestamp);
    this.beatBroadcaster.broadcast({ type: "beat", beat });

    return beat;
  }

  private async recordLessonProgress(timestamp: string): Promise<void> {
    // The conductor writes the status to the same record, so the beat count is
    // changed in place rather than by rewriting a record read earlier.
    await this.lessonRepository.updateLesson(this.lessonId, (metadata) => ({
      ...metadata,
      beatCount: this.publishedBeatCount,
      updatedAt: timestamp,
    }));
  }
}

interface BeatEnvelopeFields {
  readonly beatId: string;
  readonly lessonId: string;
  readonly sequenceNumber: number;
  readonly createdAt: string;
}

/** One branch per answer format, so a new format cannot be published half-formed. */
function quizFieldsOf(request: QuizRequest): Record<string, unknown> {
  const sharedFields = {
    questionId: request.questionId,
    question: request.question,
    explanation: request.explanation,
    relatedTerms: request.relatedTerms,
  };

  switch (request.answerFormat) {
    case "multiple_choice":
      return {
        ...sharedFields,
        answerFormat: request.answerFormat,
        choices: request.choices,
        correctChoiceIds: request.correctChoiceIds,
      };
    case "short_text":
      return {
        ...sharedFields,
        answerFormat: request.answerFormat,
        correctAnswerCriteria: request.correctAnswerCriteria,
      };
  }
}
