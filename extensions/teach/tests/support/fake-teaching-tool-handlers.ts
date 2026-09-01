import type {
  CodeBeat,
  ConceptCardBeat,
  DefinitionBeat,
  DiagramBeat,
  ImageBeat,
  LessonEndBeat,
  PauseBeat,
  QuizBeat,
} from "../../shared/beat.ts";
import { parseDiagramBeat, parseImageBeat } from "../../shared/beat.ts";
import { parseIllustrationRequest } from "../../shared/visuals/illustration-request.ts";
import type {
  CodeRequest,
  ConceptCardRequest,
  DefinitionRequest,
  DiagramRequest,
  LessonEndRequest,
  PauseRequest,
  QuizRequest,
} from "../../src/services/beat-publisher.ts";
import { LessonAlreadyPausedError } from "../../src/services/beat-publisher.ts";
import type { AgentGrade, QuizGradingOutcome } from "../../src/services/quiz-grading-service.ts";
import type { ReferenceExcerpt } from "../../src/references/reference-library-service.ts";
import type { StoredReference } from "../../src/references/reference.ts";
import type {
  IllustrationToolRequest,
  ReferenceReadRequest,
  TeachingToolHandlers,
} from "../../src/services/teaching-tools.ts";

const LESSON_ID = "lesson-abc123";
/** Any 64 character hex string, standing in for a content hash. */
const ILLUSTRATION_ID = "b".repeat(64);

/**
 * Stands in for the publishing and grading services behind the teaching tools, so
 * a tool test is about what the tool passes on and what it tells the model, not
 * about storage.
 */
export class FakeTeachingToolHandlers implements TeachingToolHandlers {
  readonly conceptCards: ConceptCardRequest[] = [];
  readonly definitions: DefinitionRequest[] = [];
  readonly codeSnippets: CodeRequest[] = [];
  readonly diagrams: DiagramRequest[] = [];
  readonly illustrations: IllustrationToolRequest[] = [];
  readonly quizQuestions: QuizRequest[] = [];
  readonly pauses: PauseRequest[] = [];
  readonly lessonEndings: LessonEndRequest[] = [];
  readonly agentGrades: AgentGrade[] = [];
  readonly referenceReads: ReferenceReadRequest[] = [];
  storedReferences: readonly StoredReference[] = [];
  referenceExcerpt: ReferenceExcerpt | null = null;

  /** Set to act like a publisher whose turn has already paused. */
  refuseBecausePaused = false;
  /** Set to act like a lesson with no Shopify AI Proxy credential. */
  canDrawPictures = true;
  gradingOutcome: QuizGradingOutcome = {
    kind: "graded",
    attempt: {
      attemptId: "attempt-1",
      lessonId: LESSON_ID,
      beatId: "beat-1",
      questionId: "queue-purpose-1",
      answerFormat: "short_text",
      submittedAnswer: "Work can wait.",
      selectedChoiceIds: [],
      grade: "correct",
      gradedBy: "teaching_agent",
      explanation: "That is it.",
      relatedTerms: [],
      answeredAt: "2024-05-01T10:00:00.000Z",
    },
  };

  private beatCount = 0;

  async publishConceptCard(request: ConceptCardRequest): Promise<ConceptCardBeat> {
    this.conceptCards.push(request);
    return { kind: "concept_card", ...this.envelope(), ...request };
  }

  async publishDefinition(request: DefinitionRequest): Promise<DefinitionBeat> {
    this.refuseIfPaused();
    this.definitions.push(request);
    return {
      kind: "definition",
      ...this.envelope(),
      term: request.term,
      fullForm: request.fullForm,
      plainLanguageMeaning: request.plainLanguageMeaning,
      example: request.example,
    };
  }

  async publishCode(request: CodeRequest): Promise<CodeBeat> {
    this.refuseIfPaused();
    this.codeSnippets.push(request);
    return {
      kind: "code",
      ...this.envelope(),
      language: request.language,
      fileName: request.fileName,
      code: request.code,
      explanation: request.explanation,
      emphasizedLineRanges: request.emphasizedLineRanges,
    };
  }

  async publishDiagram(request: DiagramRequest): Promise<DiagramBeat> {
    this.refuseIfPaused();
    this.diagrams.push(request);
    // Parsed for real, so a tool test that builds a bad diagram fails here rather
    // than passing against a fake that accepts anything.
    return parseDiagramBeat({ kind: "diagram", ...this.envelope(), spec: request.spec });
  }

  async requestIllustration(request: IllustrationToolRequest): Promise<ImageBeat | null> {
    this.refuseIfPaused();
    if (!this.canDrawPictures) {
      return null;
    }
    this.illustrations.push(request);
    return parseImageBeat({
      kind: "image",
      ...this.envelope(),
      request: parseIllustrationRequest(request),
      illustrationId: ILLUSTRATION_ID,
    });
  }

  async listReferences(): Promise<readonly StoredReference[]> {
    return this.storedReferences;
  }

  async readReference(request: ReferenceReadRequest): Promise<ReferenceExcerpt | null> {
    this.referenceReads.push(request);
    return this.referenceExcerpt;
  }

  async publishQuiz(request: QuizRequest): Promise<QuizBeat> {
    this.refuseIfPaused();
    this.quizQuestions.push(request);
    const shape = {
      ...this.envelope(),
      kind: "quiz" as const,
      questionId: request.questionId,
      question: request.question,
      explanation: request.explanation,
      relatedTerms: request.relatedTerms,
    };
    return request.answerFormat === "multiple_choice"
      ? {
          ...shape,
          answerFormat: "multiple_choice",
          choices: request.choices,
          correctChoiceIds: request.correctChoiceIds,
        }
      : {
          ...shape,
          answerFormat: "short_text",
          correctAnswerCriteria: request.correctAnswerCriteria,
        };
  }

  async publishPause(request: PauseRequest): Promise<PauseBeat> {
    this.refuseIfPaused();
    this.pauses.push(request);
    return {
      kind: "pause",
      ...this.envelope(),
      reason: request.reason,
      suggestedWaitSeconds: request.suggestedWaitSeconds,
    };
  }

  async publishLessonEnd(request: LessonEndRequest): Promise<LessonEndBeat> {
    this.refuseIfPaused();
    this.lessonEndings.push(request);
    return {
      kind: "lesson_end",
      ...this.envelope(),
      recap: request.recap,
      masteredConcepts: request.masteredConcepts,
      suggestedNextTopics: request.suggestedNextTopics,
    };
  }

  async gradeFreeTextAnswer(grade: AgentGrade): Promise<QuizGradingOutcome> {
    this.agentGrades.push(grade);
    return this.gradingOutcome;
  }

  private refuseIfPaused(): void {
    if (this.refuseBecausePaused) {
      throw new LessonAlreadyPausedError();
    }
  }

  private envelope() {
    this.beatCount += 1;
    return {
      beatId: `beat-${this.beatCount}`,
      lessonId: LESSON_ID,
      sequenceNumber: this.beatCount,
      createdAt: "2024-05-01T10:00:00.000Z",
    };
  }
}
