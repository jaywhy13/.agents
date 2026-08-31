import type { Beat } from "../../shared/beat.ts";
import type { LearnerSignalKind } from "../../shared/learner-history.ts";
import type { LearnerModel, PacePreference } from "./learner-model.ts";
import { DEEPEST_DEPTH_LEVEL } from "./learner-model.ts";

/**
 * The context a new teaching turn is given: a compact picture of the learner, the
 * last few beats, and the names in the glossary.
 *
 * Deliberately not the whole lesson. The system prompt holds the teaching rules and
 * never changes; this is small enough to send at the start of every turn without
 * the lesson's own history crowding out the rules.
 */

/** How many of the last beats a turn is reminded of. */
export const RECENT_BEAT_COUNT = 4;

export interface TurnBriefingInput {
  readonly learnerModel: LearnerModel;
  /** Oldest first. Only the last few are used. */
  readonly recentBeats: readonly Beat[];
  readonly glossaryTermNames: readonly string[];
}

export function buildTurnBriefing(input: TurnBriefingInput): string {
  return [
    describeLearner(input.learnerModel),
    describeGlossary(input.glossaryTermNames),
    describeRecentBeats(input.recentBeats),
  ].join("\n\n");
}

function describeLearner(learnerModel: LearnerModel): string {
  const lines = [
    `- Teach at depth ${learnerModel.depthLevel} of ${DEEPEST_DEPTH_LEVEL}, where 1 is the plainest possible explanation.`,
    `- Pace so far: ${describePace(learnerModel.pacePreference)}`,
    `- Questions answered so far: ${learnerModel.answeredQuestionCount}.`,
  ];

  if (learnerModel.knownTerms.length > 0) {
    lines.push(
      `- Terms the learner has answered correctly, so you may use them: ${learnerModel.knownTerms.join(", ")}.`,
    );
  }
  if (learnerModel.shakyTerms.length > 0) {
    lines.push(
      `- Terms the learner got wrong or was unsure about: ${learnerModel.shakyTerms.join(", ")}. Explain these again, more simply, before you use them.`,
    );
  }
  if (learnerModel.latestLearnerSignal !== null) {
    lines.push(`- ${describeLearnerSignal(learnerModel.latestLearnerSignal)}`);
  }

  return `The learner right now:\n${lines.join("\n")}`;
}

/**
 * What the learner asked for, said back plainly. One explicit branch per request, so
 * the wording cannot drift from the value, and no sentiment is invented around it:
 * the learner pressed a button, and this is what that button says.
 */
function describeLearnerSignal(signal: LearnerSignalKind): string {
  switch (signal) {
    case "simpler":
      return "The learner asked for this simpler. Use shorter sentences, smaller steps and a plain example, and do not add anything new until they follow.";
    case "go_deeper":
      return "The learner asked to go deeper. Add detail, the reasons behind it, and the cases where it does not hold.";
  }
}

/** One explicit branch per pace, so the wording cannot drift from the value. */
function describePace(pacePreference: PacePreference): string {
  switch (pacePreference) {
    case "slower":
      return "the learner stays on pauses much longer than suggested. Go slower and say less per beat.";
    case "faster":
      return "the learner moves on well before the suggested wait. You may go a little faster.";
    case "steady":
      return "about as suggested. Keep going as you are.";
  }
}

function describeGlossary(glossaryTermNames: readonly string[]): string {
  if (glossaryTermNames.length === 0) {
    return "Glossary the learner can see: no terms yet. Define a term before you rely on it.";
  }
  return `Glossary the learner can see: ${glossaryTermNames.join(", ")}. Do not define these again unless the learner is shaky on them.`;
}

function describeRecentBeats(recentBeats: readonly Beat[]): string {
  const describedBeats: string[] = [];
  for (const beat of recentBeats) {
    const description = describeBeat(beat);
    if (description !== null) {
      describedBeats.push(`- ${description}`);
    }
  }

  if (describedBeats.length === 0) {
    return "Nothing has been taught in this lesson yet.";
  }

  return `The last few things the learner saw, oldest first:\n${describedBeats
    .slice(-RECENT_BEAT_COUNT)
    .join("\n")}`;
}

/**
 * One explicit branch per beat kind. Narration is left out: it is the words for a
 * beat that is already in this list, not something else the learner saw.
 */
function describeBeat(beat: Beat): string | null {
  switch (beat.kind) {
    case "concept_card":
      return `Concept: ${beat.title}`;
    case "definition":
      return `Definition: ${beat.term}`;
    case "code":
      return `Code in ${beat.language}: ${beat.explanation}`;
    case "diagram":
      return `Diagram: ${beat.spec.title}`;
    case "image":
      return `Picture: ${beat.request.alternativeText}`;
    case "quiz":
      return `Quiz (${beat.questionId}): ${beat.question}`;
    case "pause":
      return `Pause: ${beat.reason}`;
    case "lesson_end":
      return `Lesson ended with: ${beat.recap}`;
    case "narration":
      return null;
  }
}
