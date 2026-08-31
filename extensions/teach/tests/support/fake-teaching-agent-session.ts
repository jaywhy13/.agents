import type {
  CodeBeat,
  DefinitionBeat,
  DiagramBeat,
  ImageBeat,
  LessonEndBeat,
  PauseBeat,
  QuizBeat,
} from "../../shared/beat.ts";
import type { ConceptCardBeat } from "../../shared/beat.ts";
import type {
  CodeRequest,
  ConceptCardRequest,
  DefinitionRequest,
  DiagramRequest,
  LessonEndRequest,
  PauseRequest,
  QuizRequest,
} from "../../src/services/beat-publisher.ts";
import type { AgentGrade, QuizGradingOutcome } from "../../src/services/quiz-grading-service.ts";
import type { ReferenceExcerpt } from "../../src/references/reference-library-service.ts";
import type { StoredReference } from "../../src/references/reference.ts";
import type {
  TeachingAgentSession,
  TeachingAgentSessionFactory,
} from "../../src/services/teaching-agent-session.ts";
import type {
  IllustrationToolRequest,
  ReferenceReadRequest,
  TeachingToolHandlers,
} from "../../src/services/teaching-tools.ts";

/**
 * Stands in for the dedicated pi agent session. It never calls a model; the test
 * drives it directly, which is what lets these tests run offline. Its methods are
 * named after the tools the real session would expose to the model.
 */
export class FakeTeachingAgentSession implements TeachingAgentSession {
  readonly prompts: string[] = [];
  abortCount = 0;
  disposeCount = 0;
  isStreaming = false;

  private readonly toolHandlers: TeachingToolHandlers;
  private pendingPrompt: { resolve: () => void; reject: (cause: Error) => void } | null = null;

  constructor(toolHandlers: TeachingToolHandlers) {
    this.toolHandlers = toolHandlers;
  }

  async prompt(text: string): Promise<void> {
    this.prompts.push(text);
    this.isStreaming = true;
    try {
      await new Promise<void>((resolve, reject) => {
        this.pendingPrompt = { resolve, reject };
      });
    } finally {
      this.isStreaming = false;
    }
  }

  async abort(): Promise<void> {
    this.abortCount += 1;
    this.finishCurrentPrompt();
  }

  dispose(): void {
    this.disposeCount += 1;
  }

  /** Lets the test end the teaching turn the way a real model would. */
  finishCurrentPrompt(): void {
    const pending = this.pendingPrompt;
    this.pendingPrompt = null;
    pending?.resolve();
  }

  /** Lets the test end the teaching turn the way a failing model would. */
  failCurrentPrompt(cause: Error): void {
    const pending = this.pendingPrompt;
    this.pendingPrompt = null;
    pending?.reject(cause);
  }

  get latestPrompt(): string {
    const latest = this.prompts[this.prompts.length - 1];
    if (latest === undefined) {
      throw new Error("The teaching session has not been prompted yet.");
    }
    return latest;
  }

  async teachConcept(request: ConceptCardRequest): Promise<ConceptCardBeat> {
    return this.toolHandlers.publishConceptCard(request);
  }

  async defineTerm(request: DefinitionRequest): Promise<DefinitionBeat> {
    return this.toolHandlers.publishDefinition(request);
  }

  async showCode(request: CodeRequest): Promise<CodeBeat> {
    return this.toolHandlers.publishCode(request);
  }

  async drawDiagram(request: DiagramRequest): Promise<DiagramBeat> {
    return this.toolHandlers.publishDiagram(request);
  }

  async requestIllustration(request: IllustrationToolRequest): Promise<ImageBeat | null> {
    return this.toolHandlers.requestIllustration(request);
  }

  async listReferences(): Promise<readonly StoredReference[]> {
    return this.toolHandlers.listReferences();
  }

  async readReference(request: ReferenceReadRequest): Promise<ReferenceExcerpt | null> {
    return this.toolHandlers.readReference(request);
  }

  async askQuizQuestion(request: QuizRequest): Promise<QuizBeat> {
    return this.toolHandlers.publishQuiz(request);
  }

  async pauseLesson(request: PauseRequest): Promise<PauseBeat> {
    return this.toolHandlers.publishPause(request);
  }

  async endLesson(request: LessonEndRequest): Promise<LessonEndBeat> {
    return this.toolHandlers.publishLessonEnd(request);
  }

  async gradeFreeTextAnswer(grade: AgentGrade): Promise<QuizGradingOutcome> {
    return this.toolHandlers.gradeFreeTextAnswer(grade);
  }
}

export class FakeTeachingAgentSessionFactory {
  readonly createdSessions: FakeTeachingAgentSession[] = [];
  readonly systemPrompts: string[] = [];

  readonly create: TeachingAgentSessionFactory = async (options) => {
    this.systemPrompts.push(options.systemPrompt);
    const session = new FakeTeachingAgentSession(options.toolHandlers);
    this.createdSessions.push(session);
    return session;
  };

  get onlySession(): FakeTeachingAgentSession {
    const session = this.createdSessions[0];
    if (session === undefined) {
      throw new Error("No teaching session was created.");
    }
    return session;
  }
}
