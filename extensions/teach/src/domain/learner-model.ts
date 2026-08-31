import type {
  LearnerSignal,
  LearnerSignalKind,
  PauseDwell,
  QuizAttempt,
  QuizGrade,
} from "../../shared/learner-history.ts";

/**
 * A small picture of the learner, worked out from what they have actually done:
 * the questions they answered, how long they stayed on each pause, and what they
 * asked for outright.
 *
 * The first two are inferences. A grade says something about understanding and a
 * dwell says something about pace, and both are guesses. The third is not a guess:
 * the learner pressed "Simpler" or "Go deeper". So it is applied last and it wins,
 * and nothing here tries to read a mood out of anything.
 *
 * It is a pure value object. Nothing here reads a file or a clock, so the same
 * history always gives the same model, and every teaching rule that depends on it
 * can be tested by handing it a history.
 */

export const PACE_PREFERENCES = ["slower", "steady", "faster"] as const;

export type PacePreference = (typeof PACE_PREFERENCES)[number];

export const SHALLOWEST_DEPTH_LEVEL = 1;
export const DEEPEST_DEPTH_LEVEL = 5;
/** A learner who has answered nothing yet is taught just below the middle. */
export const STARTING_DEPTH_LEVEL = 2;

/** Waiting this many times the suggested wait means the lesson is going too fast. */
const SLOWER_PACE_RATIO = 1.5;
/** Leaving this early, or earlier, means the lesson is going too slowly. */
const FASTER_PACE_RATIO = 0.5;

export interface LearnerModel {
  /** 1 is the plainest possible explanation, 5 is the most detailed. */
  readonly depthLevel: number;
  readonly knownTerms: readonly string[];
  readonly shakyTerms: readonly string[];
  readonly pacePreference: PacePreference;
  readonly answeredQuestionCount: number;
  /** The newest thing the learner asked for in as many words, or nothing yet. */
  readonly latestLearnerSignal: LearnerSignalKind | null;
}

export interface LearnerHistory {
  /** Oldest first: later answers are allowed to overrule earlier ones. */
  readonly quizAttempts: readonly QuizAttempt[];
  readonly pauseDwells: readonly PauseDwell[];
  /** Oldest first. What the learner asked for with the Simpler and Go deeper controls. */
  readonly learnerSignals: readonly LearnerSignal[];
}

export function deriveLearnerModel(history: LearnerHistory): LearnerModel {
  const termConfidence = latestConfidencePerTerm(history.quizAttempts);
  const latestLearnerSignal = newestSignalIn(history.learnerSignals);

  return {
    depthLevel: depthLevelFrom(history.quizAttempts, history.learnerSignals),
    knownTerms: termsWithConfidence(termConfidence, true),
    shakyTerms: termsWithConfidence(termConfidence, false),
    pacePreference: pacePreferenceFrom(history.pauseDwells, latestLearnerSignal),
    answeredQuestionCount: history.quizAttempts.length,
    latestLearnerSignal,
  };
}

/** One explicit step per request, so a new signal cannot inherit an old meaning. */
function depthStepForSignal(signal: LearnerSignalKind): number {
  switch (signal) {
    case "simpler":
      return -1;
    case "go_deeper":
      return 1;
  }
}

/** One explicit pace per request, for the same reason. */
function paceForSignal(signal: LearnerSignalKind): PacePreference {
  switch (signal) {
    case "simpler":
      return "slower";
    case "go_deeper":
      return "faster";
  }
}

function newestSignalIn(learnerSignals: readonly LearnerSignal[]): LearnerSignalKind | null {
  return learnerSignals[learnerSignals.length - 1]?.signal ?? null;
}

/** One explicit step per grade, so a new grade cannot slip through unweighted. */
function depthStepFor(grade: QuizGrade): number {
  switch (grade) {
    case "correct":
      return 1;
    case "partly_correct":
      return -1;
    case "incorrect":
      return -2;
  }
}

/**
 * The answers move the depth, and then what the learner asked for moves it again.
 * Applying the requests last is what makes "Simpler" work even for a learner who
 * has been getting every question right.
 */
function depthLevelFrom(
  quizAttempts: readonly QuizAttempt[],
  learnerSignals: readonly LearnerSignal[],
): number {
  let depthLevel = STARTING_DEPTH_LEVEL;
  for (const attempt of quizAttempts) {
    depthLevel = clampDepth(depthLevel + depthStepFor(attempt.grade));
  }
  for (const learnerSignal of learnerSignals) {
    depthLevel = clampDepth(depthLevel + depthStepForSignal(learnerSignal.signal));
  }
  return depthLevel;
}

function clampDepth(depthLevel: number): number {
  return Math.min(DEEPEST_DEPTH_LEVEL, Math.max(SHALLOWEST_DEPTH_LEVEL, depthLevel));
}

interface TermConfidence {
  readonly term: string;
  readonly isKnown: boolean;
}

/**
 * The newest answer about a term is the one that counts: a learner who gets a term
 * right after getting it wrong now knows it, and the other way round.
 */
function latestConfidencePerTerm(
  quizAttempts: readonly QuizAttempt[],
): ReadonlyMap<string, TermConfidence> {
  const confidencePerTerm = new Map<string, TermConfidence>();

  for (const attempt of quizAttempts) {
    for (const term of attempt.relatedTerms) {
      confidencePerTerm.set(term.trim().toLowerCase(), {
        term: term.trim(),
        isKnown: attempt.grade === "correct",
      });
    }
  }

  return confidencePerTerm;
}

function termsWithConfidence(
  termConfidence: ReadonlyMap<string, TermConfidence>,
  isKnown: boolean,
): readonly string[] {
  const terms: string[] = [];
  for (const confidence of termConfidence.values()) {
    if (confidence.isKnown === isKnown) {
      terms.push(confidence.term);
    }
  }
  return terms.sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }));
}

/**
 * A pause dwell is a guess about pace. A learner who said "Simpler" has answered the
 * question directly, so their answer is used instead of the guess.
 */
function pacePreferenceFrom(
  pauseDwells: readonly PauseDwell[],
  latestLearnerSignal: LearnerSignalKind | null,
): PacePreference {
  if (latestLearnerSignal !== null) {
    return paceForSignal(latestLearnerSignal);
  }

  const ratios: number[] = [];
  for (const dwell of pauseDwells) {
    // A pause that suggested no wait says nothing about pace, and would divide by zero.
    if (dwell.suggestedWaitSeconds > 0) {
      ratios.push(dwell.actualWaitSeconds / dwell.suggestedWaitSeconds);
    }
  }

  if (ratios.length === 0) {
    return "steady";
  }

  const averageRatio = ratios.reduce((total, ratio) => total + ratio, 0) / ratios.length;
  if (averageRatio >= SLOWER_PACE_RATIO) {
    return "slower";
  }
  if (averageRatio <= FASTER_PACE_RATIO) {
    return "faster";
  }
  return "steady";
}
