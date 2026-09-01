import { randomBytes } from "node:crypto";

import type { LearnerSignal, LearnerSignalKind } from "../../shared/learner-history.ts";
import type {
  LessonMetadata,
  LessonSetup,
  LessonStatus,
  LessonTranscript,
} from "../../shared/lesson.ts";
import type { QuizAnswerSubmission } from "../../shared/protocol.ts";
import type { IllustrationRequest } from "../../shared/visuals/illustration-request.ts";
import { parseIllustrationRequest } from "../../shared/visuals/illustration-request.ts";
import { buildTeachingSystemPrompt } from "../domain/teaching-system-prompt.ts";
import type { TurnTrigger } from "../domain/turn-prompt.ts";
import { buildTurnPrompt } from "../domain/turn-prompt.ts";
import type { ReferenceIngestionOutcome } from "../references/reference-ingestion-service.ts";
import type { BeatBroadcaster } from "./beat-broadcaster.ts";
import { BeatPublisher } from "./beat-publisher.ts";
import { IllustrationBoard } from "./illustration-board.ts";
import { LearnerBriefingService } from "./learner-briefing-service.ts";
import type { LessonConductor } from "./lesson-conductor.ts";
import type { LessonReferenceServices } from "./lesson-reference-services.ts";
import type { LessonRepository } from "./lesson-repository.ts";
import type { IllustrationDrawer, IllustrationDrawerFactory } from "./lesson-illustrator.ts";
import { PauseDwellRecorder } from "./pause-dwell-recorder.ts";
import { QuizGradingService } from "./quiz-grading-service.ts";
import type {
  TeachingAgentSession,
  TeachingAgentSessionFactory,
} from "./teaching-agent-session.ts";
import type { IllustrationToolRequest, TeachingToolHandlers } from "./teaching-tools.ts";

export class LessonAlreadyRunningError extends Error {
  constructor() {
    super("A lesson is already being taught. Stop it before starting another one.");
    this.name = "LessonAlreadyRunningError";
  }
}

export interface TeachingLessonConductorOptions {
  readonly lessonRepository: LessonRepository;
  readonly beatBroadcaster: BeatBroadcaster;
  readonly createTeachingAgentSession: TeachingAgentSessionFactory;
  /** Copies the learner's background in, and reads it back in bounded windows. */
  readonly references: LessonReferenceServices;
  /**
   * Builds the thing that draws pictures for one lesson, or null when this pi
   * session has no Shopify AI Proxy credential. A lesson without pictures still
   * teaches, so this is a null rather than a failure.
   */
  readonly createIllustrationDrawer?: IllustrationDrawerFactory | null;
  readonly now?: () => Date;
  readonly createLessonId?: () => string;
  /** Reports a failed teaching turn to the pi session that opened the lesson. */
  readonly onError?: (error: Error) => void;
  /**
   * Called once a lesson is closed and will not be taught again. Whatever was being
   * held for that lesson — spoken audio, most of all — can be let go.
   */
  readonly onLessonRetired?: (lessonId: string) => void;
}

/**
 * Everything the teaching tools work with. It exists on its own because the tools
 * have to be built before the agent session that will call them, so the session
 * cannot be one of its fields.
 */
interface LessonWorkbench {
  readonly lessonId: string;
  readonly beatPublisher: BeatPublisher;
  readonly quizGradingService: QuizGradingService;
  readonly pauseDwellRecorder: PauseDwellRecorder;
  readonly illustrationDrawer: IllustrationDrawer | null;
  /**
   * Pictures being drawn in the background. They are awaited when the lesson is
   * closed, so a rejection can never escape as an unhandled rejection.
   */
  readonly drawingsInFlight: Set<Promise<void>>;
}

interface ActiveLesson extends LessonWorkbench {
  readonly agentSession: TeachingAgentSession;
  readonly learnerBriefingService: LearnerBriefingService;
  readonly illustrationBoard: IllustrationBoard;
  wasInterrupted: boolean;
}

/**
 * Runs one lesson on its own pi agent session. The session gets the teaching
 * system prompt and only the teaching tools, so it cannot read or change the
 * learner's files while it teaches.
 *
 * A teaching turn can run for minutes, so the methods the lesson page calls return
 * as soon as the turn has started. Progress reaches the page as beats and status
 * messages, and `interrupt()` stops a turn that is still running.
 *
 * Each turn is short on purpose: something happens, the lesson responds to it, and
 * it pauses again. Every turn is given a fresh briefing about the learner, so the
 * lesson adapts without the system prompt carrying the lesson's whole history.
 */
export class TeachingLessonConductor implements LessonConductor {
  private readonly lessonRepository: LessonRepository;
  private readonly beatBroadcaster: BeatBroadcaster;
  private readonly createTeachingAgentSession: TeachingAgentSessionFactory;
  private readonly references: LessonReferenceServices;
  private readonly createIllustrationDrawer: IllustrationDrawerFactory | null;
  private readonly now: () => Date;
  private readonly createLessonId: () => string;
  private readonly onError: (error: Error) => void;
  private readonly onLessonRetired: (lessonId: string) => void;
  private activeLesson: ActiveLesson | null = null;
  private runningTurn: Promise<void> | null = null;
  /** Resolves once the newest turn's prompt has reached the teaching session. */
  private turnReachedSession: Promise<void> = Promise.resolve();
  /** Names the newest turn, so an older turn never clears a newer one. */
  private latestTurnNumber = 0;

  constructor(options: TeachingLessonConductorOptions) {
    this.lessonRepository = options.lessonRepository;
    this.beatBroadcaster = options.beatBroadcaster;
    this.createTeachingAgentSession = options.createTeachingAgentSession;
    this.references = options.references;
    this.createIllustrationDrawer = options.createIllustrationDrawer ?? null;
    this.now = options.now ?? (() => new Date());
    this.createLessonId = options.createLessonId ?? defaultLessonId;
    this.onError = options.onError ?? (() => {});
    this.onLessonRetired = options.onLessonRetired ?? (() => {});
  }

  get isTeaching(): boolean {
    return this.runningTurn !== null;
  }

  async getTranscript(): Promise<LessonTranscript | null> {
    const lessonId = this.activeLesson?.lessonId;
    if (lessonId === undefined) {
      return null;
    }

    const metadata = await this.lessonRepository.getLesson(lessonId);
    if (metadata === null) {
      return null;
    }

    const [beats, quizAttempts] = await Promise.all([
      this.lessonRepository.listBeats(lessonId),
      this.lessonRepository.listQuizAttempts(lessonId),
    ]);
    return {
      metadata,
      beats,
      quizAttempts,
      illustrations: this.activeLesson?.illustrationBoard.list() ?? [],
    };
  }

  async startLesson(setup: LessonSetup): Promise<void> {
    if (this.isTeaching) {
      throw new LessonAlreadyRunningError();
    }
    // A lesson that has finished or been stopped is still the active one, so that a
    // page which reloads can read it back. Starting the next lesson retires it.
    this.retireActiveLesson();

    const metadata = await this.recordNewLesson(setup);
    // The background is copied before the first turn, so the lesson's very first
    // beat can already quote it. One reference failing is reported and passed over:
    // a lesson with less background is far better than no lesson.
    await this.copyReferences(metadata.lessonId, setup);
    const activeLesson = await this.openLesson(metadata);
    this.activeLesson = activeLesson;
    await this.beginTurn({ kind: "first_turn" });
  }

  private async copyReferences(lessonId: string, setup: LessonSetup): Promise<void> {
    if (setup.references.length === 0) {
      return;
    }

    let outcomes: readonly ReferenceIngestionOutcome[];
    try {
      outcomes = await this.references.referenceIngestionService.copyAll(
        lessonId,
        setup.references,
      );
    } catch (cause) {
      // `copyAll` reports a bad reference rather than throwing, so reaching here is
      // something else going wrong. The lesson still starts, with no background.
      this.onError(asError(cause));
      this.noticeToLearner(
        "error",
        "None of your background could be copied. The lesson will teach without it.",
      );
      return;
    }

    for (const outcome of outcomes) {
      if (outcome.status === "failed") {
        this.noticeToLearner(
          "error",
          `“${outcome.label}” could not be copied: ${outcome.reason} The lesson carries on without it.`,
        );
      }
    }
  }

  async answerQuestion(questionId: string, text: string): Promise<void> {
    await this.recordResumeFromPause();
    await this.beginTurn({ kind: "learner_question", questionId, text });
  }

  async submitQuizAnswer(questionId: string, submission: QuizAnswerSubmission): Promise<void> {
    const activeLesson = this.activeLesson;
    if (activeLesson === null) {
      return;
    }
    // Graded before a turn is started, so an answer that arrives mid-turn is never
    // recorded and then dropped.
    if (this.isTeaching) {
      throw new LessonAlreadyRunningError();
    }

    await this.recordResumeFromPause();
    const outcome = await activeLesson.quizGradingService.gradeAnswer(questionId, submission);

    switch (outcome.kind) {
      case "graded":
        await this.beginTurn({
          kind: "graded_answer",
          grade: outcome.attempt.grade,
          question: outcome.attempt.questionId,
          submittedAnswer: outcome.attempt.submittedAnswer,
        });
        return;
      case "needs_agent_grading":
        await this.beginTurn({
          kind: "grade_free_text_answer",
          questionId: outcome.questionId,
          question: outcome.question,
          correctAnswerCriteria: outcome.correctAnswerCriteria,
          submittedAnswer: outcome.submittedAnswer,
        });
        return;
      case "unknown_question":
        this.noticeToLearner("error", "That question is not part of this lesson.");
        return;
      case "wrong_answer_format":
        this.noticeToLearner("error", "That question is not answered that way.");
        return;
      case "no_answer_waiting":
        this.noticeToLearner("info", "That answer has already been graded.");
        return;
    }
  }

  /**
   * The learner highlighted some words and asked what they mean. It is a short turn
   * of its own, so it never interrupts a turn that is still teaching and never
   * changes where the lesson had got to.
   */
  async requestDefinition(selectedText: string): Promise<void> {
    if (this.activeLesson === null) {
      return;
    }
    if (this.isTeaching) {
      this.noticeToLearner(
        "info",
        "The lesson is still teaching. Ask again once it pauses, or press Stop now first.",
      );
      return;
    }

    await this.beginTurn({ kind: "define_selection", text: selectedText });
  }

  /**
   * The learner asked to be quizzed. It is a turn of its own, so it waits for a turn
   * that is still teaching rather than cutting it off.
   */
  async requestQuiz(): Promise<void> {
    if (this.activeLesson === null) {
      return;
    }
    if (this.isTeaching) {
      this.noticeToLearner(
        "info",
        "The lesson is still teaching. Ask again once it pauses, or press Stop now first.",
      );
      return;
    }

    await this.recordResumeFromPause();
    await this.beginTurn({ kind: "quiz_me" });
  }

  /**
   * The learner pressed Simpler or Go deeper.
   *
   * The request is written down first and always, even while the lesson is teaching:
   * it is a fact about the learner, and every later turn is briefed with it. Only the
   * turn that answers it right now needs the lesson to be paused.
   */
  async recordLearnerSignal(signal: LearnerSignalKind): Promise<void> {
    const activeLesson = this.activeLesson;
    if (activeLesson === null) {
      return;
    }

    const learnerSignal: LearnerSignal = {
      lessonId: activeLesson.lessonId,
      signal,
      askedAt: this.now().toISOString(),
    };
    await this.lessonRepository.appendLearnerSignal(activeLesson.lessonId, learnerSignal);

    if (this.isTeaching) {
      this.noticeToLearner(
        "info",
        "Noted. The lesson will teach that way from its next beat.",
      );
      return;
    }

    await this.recordResumeFromPause();
    await this.beginTurn({ kind: "learner_signal", signal });
  }

  async continueLesson(): Promise<void> {
    await this.recordResumeFromPause();
    await this.beginTurn({ kind: "continue" });
  }

  async interrupt(): Promise<void> {
    const activeLesson = this.activeLesson;
    if (activeLesson === null) {
      return;
    }
    activeLesson.wasInterrupted = true;
    // A turn that has not reached the teaching session yet cannot be stopped: the
    // abort would find nothing to stop and the turn would start straight after it.
    await this.turnReachedSession;
    await activeLesson.agentSession.abort();
    await this.waitForIdle();
    await this.announceStatus("aborted");
  }

  async dispose(): Promise<void> {
    if (this.activeLesson === null) {
      return;
    }
    if (this.isTeaching) {
      await this.interrupt();
    }
    await this.waitForDrawings();
    this.retireActiveLesson();
  }

  /** Resolves when no teaching turn is in flight. */
  async waitForIdle(): Promise<void> {
    while (this.runningTurn !== null) {
      await this.runningTurn;
    }
  }

  /** Builds everything one lesson needs, and the agent session that uses it. */
  private async openLesson(metadata: LessonMetadata): Promise<ActiveLesson> {
    const lessonId = metadata.lessonId;
    const beatPublisher = new BeatPublisher({
      lessonId,
      lessonRepository: this.lessonRepository,
      beatBroadcaster: this.beatBroadcaster,
      startingBeatCount: metadata.beatCount,
      now: this.now,
    });
    const quizGradingService = new QuizGradingService({
      lessonId,
      lessonRepository: this.lessonRepository,
      beatBroadcaster: this.beatBroadcaster,
      now: this.now,
    });
    const pauseDwellRecorder = new PauseDwellRecorder({
      lessonId,
      lessonRepository: this.lessonRepository,
      now: this.now,
    });
    const learnerBriefingService = new LearnerBriefingService({
      lessonId,
      lessonRepository: this.lessonRepository,
    });
    const illustrationBoard = new IllustrationBoard(this.beatBroadcaster);
    const illustrationDrawer =
      this.createIllustrationDrawer === null
        ? null
        : this.createIllustrationDrawer((state) => illustrationBoard.record(state));

    const workbench: LessonWorkbench = {
      lessonId,
      beatPublisher,
      quizGradingService,
      pauseDwellRecorder,
      illustrationDrawer,
      drawingsInFlight: new Set(),
    };

    const agentSession = await this.createTeachingAgentSession({
      systemPrompt: buildTeachingSystemPrompt(metadata, {
        canDrawPictures: illustrationDrawer !== null,
      }),
      toolHandlers: this.teachingToolHandlersFor(workbench),
    });

    return {
      ...workbench,
      agentSession,
      learnerBriefingService,
      illustrationBoard,
      wasInterrupted: false,
    };
  }

  /**
   * The tools call the services directly. The conductor adds three things a service
   * on its own cannot know: a published pause starts the clock the pace measurement
   * needs, a picture is drawn after the beat rather than before it, and the
   * reference library is asked about this lesson.
   */
  private teachingToolHandlersFor(lesson: LessonWorkbench): TeachingToolHandlers {
    return {
      publishConceptCard: (request) => lesson.beatPublisher.publishConceptCard(request),
      publishDefinition: (request) => lesson.beatPublisher.publishDefinition(request),
      publishCode: (request) => lesson.beatPublisher.publishCode(request),
      publishDiagram: (request) => lesson.beatPublisher.publishDiagram(request),
      requestIllustration: (request) => this.requestIllustration(lesson, request),
      publishQuiz: (request) => lesson.beatPublisher.publishQuiz(request),
      publishPause: async (request) => {
        const beat = await lesson.beatPublisher.publishPause(request);
        lesson.pauseDwellRecorder.notePause(beat);
        return beat;
      },
      publishLessonEnd: (request) => lesson.beatPublisher.publishLessonEnd(request),
      gradeFreeTextAnswer: (grade) => lesson.quizGradingService.recordAgentGrade(grade),
      listReferences: () =>
        this.references.referenceLibraryService.list(lesson.lessonId),
      readReference: async (request) => {
        try {
          return await this.references.referenceLibraryService.readExcerpt(
            lesson.lessonId,
            request.referenceId,
            { offset: request.offset, limit: request.limit },
          );
        } catch {
          // A reference the lesson does not have is the model's mistake to correct,
          // not a failed turn. Every other read problem reads the same way to it.
          return null;
        }
      },
    };
  }

  /**
   * Publishes the image beat now and draws the picture afterwards.
   *
   * Drawing takes seconds. Holding the tool call open for it would stop the rest of
   * the turn, so the beat goes out at once with the words that stand in for the
   * picture, and the drawing runs on its own. The promise is kept so it can be
   * awaited when the lesson closes: nothing else awaits it, so an escaped rejection
   * would be an unhandled rejection and would end the pi process.
   */
  private async requestIllustration(
    lesson: LessonWorkbench,
    request: IllustrationToolRequest,
  ): Promise<Awaited<ReturnType<TeachingToolHandlers["requestIllustration"]>>> {
    const drawer = lesson.illustrationDrawer;
    if (drawer === null) {
      return null;
    }

    let illustration: IllustrationRequest;
    try {
      illustration = parseIllustrationRequest(request);
    } catch (cause) {
      // The tool's own schema already limits these fields, so this is the value
      // object having a rule the schema cannot express. The model is told plainly.
      throw asError(cause);
    }

    const beat = await lesson.beatPublisher.publishImage({
      illustration,
      illustrationId: drawer.illustrationIdFor(illustration),
      narration: request.narration,
    });

    const drawing = drawer
      .illustrate(lesson.lessonId, illustration)
      .then(() => {})
      .catch((cause: unknown) => {
        // The drawer publishes a failed state itself, so there is nothing to tell the
        // learner here. This is only so the rejection has an owner.
        this.onError(asError(cause));
      })
      .finally(() => {
        lesson.drawingsInFlight.delete(drawing);
      });
    lesson.drawingsInFlight.add(drawing);

    return beat;
  }

  private async recordResumeFromPause(): Promise<void> {
    try {
      await this.activeLesson?.pauseDwellRecorder.recordResume();
    } catch (cause) {
      // Losing one pace measurement must never stop the lesson carrying on.
      this.onError(asError(cause));
    }
  }

  /** Closes the current lesson's teaching session and forgets it. */
  private retireActiveLesson(): void {
    const activeLesson = this.activeLesson;
    this.activeLesson = null;
    this.runningTurn = null;
    if (activeLesson === null) {
      return;
    }
    try {
      activeLesson.agentSession.dispose();
    } catch (cause) {
      this.onError(asError(cause));
    }
    try {
      this.onLessonRetired(activeLesson.lessonId);
    } catch (cause) {
      // Letting go of a closed lesson's audio is housekeeping. It must never be the
      // reason the next lesson cannot start.
      this.onError(asError(cause));
    }
  }

  /** Waits for the pictures still being drawn, so none is left without an owner. */
  private async waitForDrawings(): Promise<void> {
    const drawings = this.activeLesson?.drawingsInFlight;
    if (drawings === undefined) {
      return;
    }
    while (drawings.size > 0) {
      await Promise.all([...drawings]);
    }
  }

  /**
   * Starts a teaching turn and resolves once the prompt has reached the teaching
   * session, not when the turn finishes. Callers that resolved earlier than that
   * could not stop, abort or drive the turn they had just asked for, because the
   * turn had not reached the session yet.
   */
  private beginTurn(trigger: TurnTrigger): Promise<void> {
    const activeLesson = this.activeLesson;
    if (activeLesson === null) {
      return Promise.resolve();
    }
    if (this.isTeaching) {
      throw new LessonAlreadyRunningError();
    }

    activeLesson.wasInterrupted = false;
    // Every turn starts with the pause guard cleared, so the pause that ended the
    // last turn does not block this one.
    activeLesson.beatPublisher.beginTurn();
    // Every new turn says so, not just the first. The page uses this to keep Stop
    // and the Space key working, and to stop a second Continue being offered.
    this.broadcastStatus("teaching");
    this.latestTurnNumber += 1;
    const turnReachedSession = createSignal();
    this.turnReachedSession = turnReachedSession.waitFor;
    // Assigned before anything is awaited, so a second turn asked for in the same
    // tick is refused rather than run beside this one.
    this.runningTurn = this.runTurnSafely(
      activeLesson,
      trigger,
      this.latestTurnNumber,
      turnReachedSession,
    );
    return turnReachedSession.waitFor;
  }

  /**
   * Nothing awaits a teaching turn, so this must never reject: an escaped rejection
   * would be an unhandled rejection and would take the whole pi process down.
   */
  private async runTurnSafely(
    activeLesson: ActiveLesson,
    trigger: TurnTrigger,
    turnNumber: number,
    turnReachedSession: Signal,
  ): Promise<void> {
    try {
      await this.runTurn(activeLesson, trigger, turnReachedSession);
    } catch (cause) {
      await this.reportTurnFailure(cause);
    } finally {
      // A turn that failed before it reached the session must still release the
      // caller waiting on it, or the lesson page would wait for ever.
      turnReachedSession.raise();
      if (this.latestTurnNumber === turnNumber) {
        this.runningTurn = null;
      }
    }
  }

  private async runTurn(
    activeLesson: ActiveLesson,
    trigger: TurnTrigger,
    turnReachedSession: Signal,
  ): Promise<void> {
    const briefing = await activeLesson.learnerBriefingService.briefingForNextTurn();
    const turnFinished = activeLesson.agentSession.prompt(buildTurnPrompt(trigger, briefing));
    // The turn is in flight from here. Give it a handler at once, so a failure in
    // the status write below cannot leave this rejection unhandled.
    turnFinished.catch(() => {});
    turnReachedSession.raise();

    await this.recordStatus("teaching");
    await turnFinished;

    if (!activeLesson.wasInterrupted) {
      // A turn that paused hands the lesson back to the learner rather than ending
      // it, and the page shows that difference.
      await this.announceStatus(
        activeLesson.beatPublisher.hasPausedThisTurn ? "paused" : "finished",
      );
    }
  }

  private async reportTurnFailure(cause: unknown): Promise<void> {
    const error = asError(cause);
    this.noticeToLearner("error", `The lesson stopped: ${error.message}`);
    try {
      this.onError(error);
    } catch {
      // The pi session's own notifier is best effort.
    }

    // A failed provider call otherwise leaves the page saying "Teaching now" with
    // every learner control disabled. Hand it back to the learner as a stopped turn.
    try {
      await this.announceStatus("aborted");
    } catch (statusCause) {
      try {
        this.onError(asError(statusCause));
      } catch {
        // Reporting both the original failure and this persistence failure is best effort.
      }
    }
  }

  private noticeToLearner(level: "info" | "error", text: string): void {
    try {
      this.beatBroadcaster.broadcast({ type: "notice", level, text });
    } catch {
      // A browser that has gone away must not turn one failure into two.
    }
  }

  private async recordNewLesson(setup: LessonSetup): Promise<LessonMetadata> {
    const timestamp = this.now().toISOString();
    const metadata: LessonMetadata = {
      lessonId: this.createLessonId(),
      topic: setup.topic,
      status: "setup",
      createdAt: timestamp,
      updatedAt: timestamp,
      references: setup.references,
      beatCount: 0,
    };
    await this.lessonRepository.saveLesson(metadata);
    return metadata;
  }

  private async announceStatus(status: LessonStatus): Promise<void> {
    await this.recordStatus(status);
    this.broadcastStatus(status);
  }

  private broadcastStatus(status: LessonStatus): void {
    this.beatBroadcaster.broadcast({ type: "status", status });
  }

  private async recordStatus(status: LessonStatus): Promise<void> {
    const lessonId = this.activeLesson?.lessonId;
    if (lessonId === undefined) {
      return;
    }
    // The beat publisher writes the beat count to the same record, so the status is
    // changed in place rather than by rewriting a record read earlier.
    await this.lessonRepository.updateLesson(lessonId, (metadata) => ({
      ...metadata,
      status,
      updatedAt: this.now().toISOString(),
    }));
  }
}

/** A promise a caller can wait on, and that another piece of work resolves once. */
interface Signal {
  readonly waitFor: Promise<void>;
  raise(): void;
}

function createSignal(): Signal {
  let raise = (): void => {};
  const waitFor = new Promise<void>((resolve) => {
    raise = resolve;
  });
  return { waitFor, raise };
}

function defaultLessonId(): string {
  return `lesson-${randomBytes(8).toString("hex")}`;
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
