import { randomUUID } from "node:crypto";

import type { Beat, MultipleChoiceQuizBeat, QuizBeat } from "../../shared/beat.ts";
import type { QuizAttempt, QuizGrade, QuizGrader } from "../../shared/learner-history.ts";
import type { QuizAnswerSubmission } from "../../shared/protocol.ts";
import type { BeatBroadcaster } from "./beat-broadcaster.ts";
import type { LessonRepository } from "./lesson-repository.ts";

/**
 * What grading an answer led to. The conductor decides what the lesson does next
 * from this, so every outcome is named rather than signalled by a null.
 */
export type QuizGradingOutcome =
  | { readonly kind: "graded"; readonly attempt: QuizAttempt }
  | {
      readonly kind: "needs_agent_grading";
      readonly questionId: string;
      readonly question: string;
      readonly correctAnswerCriteria: string;
      readonly submittedAnswer: string;
    }
  | { readonly kind: "unknown_question"; readonly questionId: string }
  | { readonly kind: "wrong_answer_format"; readonly questionId: string }
  | { readonly kind: "no_answer_waiting"; readonly questionId: string };

export interface AgentGrade {
  readonly questionId: string;
  readonly grade: QuizGrade;
  readonly explanation: string;
}

export interface QuizGradingServiceOptions {
  readonly lessonId: string;
  readonly lessonRepository: LessonRepository;
  readonly beatBroadcaster: BeatBroadcaster;
  readonly now?: () => Date;
  readonly createAttemptId?: () => string;
}

/**
 * Grades what the learner answered and keeps the record of it.
 *
 * A question with fixed choices is graded here: the answer is a set, so the lesson
 * server can decide it on its own and the learner gets the result at once. A
 * question answered in the learner's own words is handed to the teaching agent,
 * which grades it through a typed tool call and hands the grade back here.
 */
export class QuizGradingService {
  private readonly lessonId: string;
  private readonly lessonRepository: LessonRepository;
  private readonly beatBroadcaster: BeatBroadcaster;
  private readonly now: () => Date;
  private readonly createAttemptId: () => string;
  /** Free text answers waiting for the teaching agent to grade them. */
  private readonly answersAwaitingAgentGrade = new Map<string, string>();

  constructor(options: QuizGradingServiceOptions) {
    this.lessonId = options.lessonId;
    this.lessonRepository = options.lessonRepository;
    this.beatBroadcaster = options.beatBroadcaster;
    this.now = options.now ?? (() => new Date());
    this.createAttemptId = options.createAttemptId ?? (() => randomUUID());
  }

  async gradeAnswer(
    questionId: string,
    submission: QuizAnswerSubmission,
  ): Promise<QuizGradingOutcome> {
    const quizBeat = await this.findQuizBeat(questionId);
    if (quizBeat === null) {
      return { kind: "unknown_question", questionId };
    }
    if (quizBeat.answerFormat !== submission.format) {
      return { kind: "wrong_answer_format", questionId };
    }

    switch (submission.format) {
      case "multiple_choice":
        return this.gradeChosenAnswer(
          quizBeat as MultipleChoiceQuizBeat,
          submission.selectedChoiceIds,
        );
      case "short_text":
        this.answersAwaitingAgentGrade.set(questionId, submission.text);
        return {
          kind: "needs_agent_grading",
          questionId,
          question: quizBeat.question,
          correctAnswerCriteria:
            quizBeat.answerFormat === "short_text" ? quizBeat.correctAnswerCriteria : "",
          submittedAnswer: submission.text,
        };
    }
  }

  /** Records the grade the teaching agent gave a free text answer. */
  async recordAgentGrade(agentGrade: AgentGrade): Promise<QuizGradingOutcome> {
    const submittedAnswer = this.answersAwaitingAgentGrade.get(agentGrade.questionId);
    if (submittedAnswer === undefined) {
      return { kind: "no_answer_waiting", questionId: agentGrade.questionId };
    }
    const quizBeat = await this.findQuizBeat(agentGrade.questionId);
    if (quizBeat === null) {
      return { kind: "unknown_question", questionId: agentGrade.questionId };
    }
    // Cleared before the record is written, so one answer can only be graded once
    // however many times the model calls the grading tool.
    this.answersAwaitingAgentGrade.delete(agentGrade.questionId);

    return this.recordAttempt({
      quizBeat,
      submittedAnswer,
      selectedChoiceIds: [],
      grade: agentGrade.grade,
      gradedBy: "teaching_agent",
      explanation: agentGrade.explanation,
    });
  }

  private async gradeChosenAnswer(
    quizBeat: MultipleChoiceQuizBeat,
    selectedChoiceIds: readonly string[],
  ): Promise<QuizGradingOutcome> {
    return this.recordAttempt({
      quizBeat,
      submittedAnswer: describeChosenAnswer(quizBeat, selectedChoiceIds),
      selectedChoiceIds,
      grade: gradeChoices(quizBeat.correctChoiceIds, selectedChoiceIds),
      gradedBy: "lesson_server",
      explanation: quizBeat.explanation,
    });
  }

  private async recordAttempt(input: {
    readonly quizBeat: QuizBeat;
    readonly submittedAnswer: string;
    readonly selectedChoiceIds: readonly string[];
    readonly grade: QuizGrade;
    readonly gradedBy: QuizGrader;
    readonly explanation: string;
  }): Promise<QuizGradingOutcome> {
    const attempt: QuizAttempt = {
      attemptId: this.createAttemptId(),
      lessonId: this.lessonId,
      beatId: input.quizBeat.beatId,
      questionId: input.quizBeat.questionId,
      answerFormat: input.quizBeat.answerFormat,
      submittedAnswer: input.submittedAnswer,
      selectedChoiceIds: input.selectedChoiceIds,
      grade: input.grade,
      gradedBy: input.gradedBy,
      explanation: input.explanation,
      relatedTerms: input.quizBeat.relatedTerms,
      answeredAt: this.now().toISOString(),
    };

    await this.lessonRepository.appendQuizAttempt(this.lessonId, attempt);
    this.beatBroadcaster.broadcast({
      type: "quiz_result",
      result: {
        questionId: attempt.questionId,
        grade: attempt.grade,
        explanation: attempt.explanation,
        correctChoiceIds:
          input.quizBeat.answerFormat === "multiple_choice" ? input.quizBeat.correctChoiceIds : [],
      },
    });

    return { kind: "graded", attempt };
  }

  /** The newest question with this identifier, because a lesson may re-ask one. */
  private async findQuizBeat(questionId: string): Promise<QuizBeat | null> {
    const beats = await this.lessonRepository.listBeats(this.lessonId);
    let found: QuizBeat | null = null;
    for (const beat of beats) {
      if (isQuizBeat(beat) && beat.questionId === questionId) {
        found = beat;
      }
    }
    return found;
  }
}

function isQuizBeat(beat: Beat): beat is QuizBeat {
  return beat.kind === "quiz";
}

/**
 * One explicit branch per case, rather than a score: everything right is correct,
 * some of the right ones and nothing wrong is partly correct, and anything with a
 * wrong choice in it is incorrect.
 */
function gradeChoices(
  correctChoiceIds: readonly string[],
  selectedChoiceIds: readonly string[],
): QuizGrade {
  const correct = new Set(correctChoiceIds);
  const selected = new Set(selectedChoiceIds);

  for (const choiceId of selected) {
    if (!correct.has(choiceId)) {
      return "incorrect";
    }
  }

  if (selected.size === 0) {
    return "incorrect";
  }
  return selected.size === correct.size ? "correct" : "partly_correct";
}

function describeChosenAnswer(
  quizBeat: MultipleChoiceQuizBeat,
  selectedChoiceIds: readonly string[],
): string {
  const chosenTexts: string[] = [];
  for (const choiceId of selectedChoiceIds) {
    const choice = quizBeat.choices.find((candidate) => candidate.choiceId === choiceId);
    chosenTexts.push(choice === undefined ? `unknown choice ${choiceId}` : choice.text);
  }
  return chosenTexts.join(" ");
}
