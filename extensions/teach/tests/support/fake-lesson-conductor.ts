import type { LearnerSignalKind } from "../../shared/learner-history.ts";
import type { LessonSetup, LessonTranscript } from "../../shared/lesson.ts";
import type { QuizAnswerSubmission } from "../../shared/protocol.ts";
import type { LessonConductor } from "../../src/services/lesson-conductor.ts";

/** Records what the lesson page asked the teaching side to do. */
export class FakeLessonConductor implements LessonConductor {
  transcript: LessonTranscript | null = null;
  readonly startedSetups: LessonSetup[] = [];
  readonly answers: Array<{ questionId: string; text: string }> = [];
  readonly quizAnswers: Array<{ questionId: string; submission: QuizAnswerSubmission }> = [];
  readonly definitionRequests: string[] = [];
  readonly learnerSignals: LearnerSignalKind[] = [];
  quizRequestCount = 0;
  continueCount = 0;
  interruptCount = 0;
  disposeCount = 0;
  failureToThrow: Error | null = null;

  /**
   * Which calls arrived, in order, and how many were running at once. The lesson
   * server has to handle one page message at a time: two handlers running together
   * would both see an idle lesson and both start a turn.
   */
  readonly callOrder: string[] = [];
  callsInFlight = 0;
  mostCallsAtOnce = 0;

  private holdCalls = false;
  private held: Array<() => void> = [];

  /** Makes every call wait, so two calls sent together would have to overlap. */
  holdEachCall(): void {
    this.holdCalls = true;
  }

  releaseHeldCalls(): void {
    this.holdCalls = false;
    const waiting = this.held;
    this.held = [];
    for (const release of waiting) {
      release();
    }
  }

  async getTranscript(): Promise<LessonTranscript | null> {
    return this.transcript;
  }

  async startLesson(setup: LessonSetup): Promise<void> {
    await this.enter("start_lesson");
    this.throwIfFailing();
    this.startedSetups.push(setup);
    this.leave();
  }

  async answerQuestion(questionId: string, text: string): Promise<void> {
    await this.enter("answer");
    this.throwIfFailing();
    this.answers.push({ questionId, text });
    this.leave();
  }

  async submitQuizAnswer(questionId: string, submission: QuizAnswerSubmission): Promise<void> {
    await this.enter("quiz_answer");
    this.throwIfFailing();
    this.quizAnswers.push({ questionId, submission });
    this.leave();
  }

  async requestDefinition(selectedText: string): Promise<void> {
    await this.enter("define_selection");
    this.throwIfFailing();
    this.definitionRequests.push(selectedText);
    this.leave();
  }

  async requestQuiz(): Promise<void> {
    await this.enter("request_quiz");
    this.throwIfFailing();
    this.quizRequestCount += 1;
    this.leave();
  }

  async recordLearnerSignal(signal: LearnerSignalKind): Promise<void> {
    await this.enter("learner_signal");
    this.throwIfFailing();
    this.learnerSignals.push(signal);
    this.leave();
  }

  async continueLesson(): Promise<void> {
    await this.enter("continue");
    this.throwIfFailing();
    this.continueCount += 1;
    this.leave();
  }

  async interrupt(): Promise<void> {
    this.interruptCount += 1;
  }

  async dispose(): Promise<void> {
    this.disposeCount += 1;
  }

  private async enter(call: string): Promise<void> {
    this.callOrder.push(call);
    this.callsInFlight += 1;
    this.mostCallsAtOnce = Math.max(this.mostCallsAtOnce, this.callsInFlight);
    if (this.holdCalls) {
      await new Promise<void>((resolve) => this.held.push(resolve));
    }
  }

  private leave(): void {
    this.callsInFlight -= 1;
  }

  private throwIfFailing(): void {
    // A failing call still leaves, so a refused message never looks like one that
    // is still running.
    if (this.failureToThrow !== null) {
      this.leave();
      throw this.failureToThrow;
    }
  }
}
