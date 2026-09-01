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
import type { QuizGradingOutcome } from "../services/quiz-grading-service.ts";
import { instructionForGradedAnswer } from "./turn-prompt.ts";

/**
 * What the lesson says back to the teaching model after each tool call.
 *
 * The model cannot see the page, so the tool result is the only place it learns
 * what the learner is now looking at and what it should do next. That makes this
 * teaching guidance, not plumbing, so it lives in the domain and is tested here
 * rather than inside the tool adapters.
 */

export function conceptCardTaught(beat: ConceptCardBeat): string {
  return beat.pauseForLearner
    ? `Concept ${beat.sequenceNumber} ("${beat.title}") is on screen. The learner is reading it. Wait for the learner before the next concept.`
    : `Concept ${beat.sequenceNumber} ("${beat.title}") is on screen. Carry straight on.`;
}

export function definitionTaught(beat: DefinitionBeat): string {
  return [
    `"${beat.term}" is on screen and is now in the learner's glossary panel, where it stays for the rest of the lesson.`,
    "It is highlighted wherever it appears in the lesson from now on, so you may use the term without defining it again.",
  ].join(" ");
}

export function codeShown(beat: CodeBeat): string {
  const emphasis =
    beat.emphasizedLineRanges.length === 0
      ? "No lines are marked."
      : `${beat.emphasizedLineRanges.length} run of lines is marked for the learner.`;
  return `The ${beat.language} code is on screen with syntax highlighting and a copy button. ${emphasis} Pause now unless the learner still needs one more sentence about it.`;
}

export function diagramDrawn(beat: DiagramBeat): string {
  return [
    `The diagram "${beat.spec.title}" is on screen as revision ${beat.spec.revision}, with ${beat.spec.nodes.length} parts and ${beat.spec.edges.length} joins.`,
    "The learner can move the boxes about, and can also read it as a list of sentences.",
    `To add to this same diagram later, draw it again as "${beat.spec.diagramId}" revision ${beat.spec.revision + 1}.`,
    "Say one sentence about what to look at in it, then pause.",
  ].join(" ");
}

/**
 * A picture is asked for and drawn afterwards, so the tool result says the asking
 * worked, never that the picture is there. The model must not describe a picture it
 * has not been told arrived; the words it supplied are shown either way.
 */
export function illustrationRequested(beat: ImageBeat): string {
  return [
    "The picture is being drawn and the learner already sees your words for it:",
    `"${beat.request.alternativeText}"`,
    "It takes a few seconds and it may fail, so carry on teaching as though there were no picture.",
    "Never say what the picture shows beyond those words.",
  ].join(" ");
}

export function illustrationUnavailable(): string {
  return [
    "Nothing was shown: this lesson cannot draw pictures, because there is no Shopify AI Proxy credential.",
    "Teach the idea in words, or with a diagram, and do not offer a picture again.",
  ].join(" ");
}

export function quizAsked(beat: QuizBeat): string {
  return [
    `Question "${beat.questionId}" is on screen and the learner is answering it.`,
    "End your turn now. Do not teach anything else. The learner's answer starts a new turn.",
  ].join(" ");
}

export function lessonPaused(beat: PauseBeat): string {
  return [
    `The lesson is paused for about ${beat.suggestedWaitSeconds} seconds: ${beat.reason}`,
    "End your turn now. Call no further tools and write nothing more.",
    "Continue, a question, or an answer from the learner starts the next turn.",
  ].join(" ");
}

export function lessonEnded(beat: LessonEndBeat): string {
  return [
    `The lesson is finished and the recap is on screen with ${beat.suggestedNextTopics.length} suggested next topics.`,
    "End your turn now. The learner can start another lesson from the page.",
  ].join(" ");
}

export function beatRefusedAfterPause(): string {
  return [
    "Nothing was shown to the learner: this turn has already paused, and the learner is away from the screen.",
    "End your turn now. What you were about to teach belongs in the next turn.",
  ].join(" ");
}

/**
 * One explicit branch per grading outcome. A grade the lesson accepted carries the
 * same adaptive instruction a graded multiple choice answer would.
 */
export function freeTextAnswerGraded(outcome: QuizGradingOutcome, question: string): string {
  switch (outcome.kind) {
    case "graded":
      return [
        `The grade "${outcome.attempt.grade}" and your explanation are on screen.`,
        instructionForGradedAnswer(
          outcome.attempt.grade,
          question,
          outcome.attempt.submittedAnswer,
        ),
      ].join("\n");
    case "no_answer_waiting":
      return `There is no answer waiting to be graded for question "${outcome.questionId}". It has already been graded. End your turn.`;
    case "unknown_question":
      return `This lesson never asked a question called "${outcome.questionId}". Check the question id and try once more.`;
    case "wrong_answer_format":
      return `Question "${outcome.questionId}" is not answered in the learner's own words, so it is not yours to grade. End your turn.`;
    case "needs_agent_grading":
      return "That answer still needs grading. Call grade_free_text_answer once with your grade.";
  }
}
