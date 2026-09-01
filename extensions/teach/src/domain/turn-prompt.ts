import type { LearnerSignalKind, QuizGrade } from "../../shared/learner-history.ts";

/**
 * What starts a teaching turn, and what the turn is asked to do about it.
 *
 * Every turn is short: something happened, the lesson responds to it, and it pauses
 * again. The prompt is built here rather than in the conductor so the teaching
 * decisions — especially what a wrong answer leads to — can be read and tested on
 * their own.
 */
export type TurnTrigger =
  | { readonly kind: "first_turn" }
  | { readonly kind: "continue" }
  | {
      readonly kind: "learner_question";
      readonly questionId: string;
      readonly text: string;
    }
  | {
      readonly kind: "graded_answer";
      readonly grade: QuizGrade;
      readonly question: string;
      readonly submittedAnswer: string;
    }
  | {
      readonly kind: "grade_free_text_answer";
      readonly questionId: string;
      readonly question: string;
      readonly correctAnswerCriteria: string;
      readonly submittedAnswer: string;
    }
  | { readonly kind: "define_selection"; readonly text: string }
  /** The learner pressed "Quiz me", so a question is what this turn is for. */
  | { readonly kind: "quiz_me" }
  /** The learner pressed "Simpler" or "Go deeper". */
  | { readonly kind: "learner_signal"; readonly signal: LearnerSignalKind };

export function buildTurnPrompt(trigger: TurnTrigger, briefing: string): string {
  return [briefing, instructionFor(trigger)].join("\n\n");
}

/** One explicit branch per trigger, so a new trigger cannot inherit an old prompt. */
function instructionFor(trigger: TurnTrigger): string {
  switch (trigger.kind) {
    case "first_turn":
      return "Start the lesson. Frame the whole topic at a high level in one concept, then pause for the learner.";
    case "continue":
      return "The learner is ready. Teach the next one concept, then pause for the learner.";
    case "learner_question":
      return [
        `The learner asked: ${trigger.text}`,
        "Answer that question first, in plain language, as one beat. Then pause for the learner.",
      ].join("\n");
    case "graded_answer":
      return instructionForGradedAnswer(trigger.grade, trigger.question, trigger.submittedAnswer);
    case "grade_free_text_answer":
      return [
        "The learner answered a question in their own words. Grade it now.",
        `Question id: ${trigger.questionId}`,
        `Question: ${trigger.question}`,
        `What a correct answer must say: ${trigger.correctAnswerCriteria}`,
        `What the learner wrote: ${trigger.submittedAnswer}`,
        "Call grade_free_text_answer exactly once with that question id and your grade. Do nothing else first.",
        "Then follow the instruction the tool gives you back, and pause for the learner.",
      ].join("\n");
    case "define_selection":
      return [
        `The learner highlighted these words on the page and asked what they mean: ${trigger.text}`,
        "Call define_term once for exactly one definition of that, in plain language.",
        "Teach nothing else in this turn, and do not carry the lesson on. Pause for the learner afterwards.",
      ].join("\n");
    case "quiz_me":
      return [
        "The learner asked to be quizzed.",
        "Call ask_quiz_question exactly once, about something already taught in this lesson and nothing new.",
        "Teach nothing else in this turn. Then pause for the learner.",
      ].join("\n");
    case "learner_signal":
      return instructionForLearnerSignal(trigger.signal);
  }
}

/**
 * The learner said what they want, so the turn does that and does not interpret it.
 * One explicit branch per request: a new control must say what the lesson does about
 * it rather than inherit another one's wording.
 */
export function instructionForLearnerSignal(signal: LearnerSignalKind): string {
  switch (signal) {
    case "simpler":
      return [
        "The learner asked for that again, simpler.",
        "Do not move on and do not add anything new.",
        "Say the same idea again in the plainest way you can: shorter sentences, one small concrete example, no new terms.",
        "Then pause for the learner.",
      ].join("\n");
    case "go_deeper":
      return [
        "The learner asked to go deeper on what you have just taught.",
        "Stay on the same idea and add the detail you left out: how it works underneath, why it is done that way, and where it does not hold.",
        "Teach one concept only, then pause for the learner.",
      ].join("\n");
  }
}

/**
 * The adaptive branch. A wrong or unsure answer never leads to the next concept: it
 * leads back to the same idea, said more plainly. Only a correct answer opens the
 * door to more detail.
 */
export function instructionForGradedAnswer(
  grade: QuizGrade,
  question: string,
  submittedAnswer: string,
): string {
  const answered = [
    `The learner answered your question "${question}".`,
    `What they wrote: ${submittedAnswer}`,
  ].join("\n");

  switch (grade) {
    case "correct":
      return [
        answered,
        "That was correct. Say so in one short sentence, then you may go one step deeper on the same topic.",
        "Teach one concept only, then pause for the learner.",
      ].join("\n");
    case "partly_correct":
      return [
        answered,
        "That was only partly correct. Do not move on.",
        "Explain the same idea again in a simpler way, with a smaller example, and say which part was missing.",
        "Then pause for the learner.",
      ].join("\n");
    case "incorrect":
      return [
        answered,
        "That was wrong. Do not move on and do not add anything new.",
        "Go back to the simplest possible explanation of that same idea. Use shorter sentences and a plain example.",
        "Then pause for the learner.",
      ].join("\n");
  }
}
