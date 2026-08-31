import type { BrowserQuizBeat } from "./browser-beat.ts";
import { MAXIMUM_ANSWER_CHARACTERS, MAXIMUM_SELECTED_CHOICE_COUNT } from "./client-message.ts";
import type { QuizAnswerSubmission } from "./protocol.ts";

/**
 * What the learner has put into a quiz question so far. It is kept apart from the
 * submission the lesson accepts, because a half-filled answer is a normal state on
 * screen and never a message.
 */
export type QuizAnswerDraft =
  | { readonly kind: "chosen_choices"; readonly selectedChoiceIds: readonly string[] }
  | { readonly kind: "written_answer"; readonly text: string };

/** One branch per answer format, so a question cannot start in the wrong draft. */
export function emptyDraftFor(beat: BrowserQuizBeat): QuizAnswerDraft {
  switch (beat.answerFormat) {
    case "multiple_choice":
      return { kind: "chosen_choices", selectedChoiceIds: [] };
    case "short_text":
      return { kind: "written_answer", text: "" };
  }
}

/**
 * Every multiple choice question is answered by picking any number of choices. How
 * many are right is not shown, because that would give part of the answer away.
 */
export function withChoiceToggled(draft: QuizAnswerDraft, choiceId: string): QuizAnswerDraft {
  if (draft.kind !== "chosen_choices") {
    return draft;
  }
  if (draft.selectedChoiceIds.includes(choiceId)) {
    return {
      kind: "chosen_choices",
      selectedChoiceIds: draft.selectedChoiceIds.filter((picked) => picked !== choiceId),
    };
  }
  return { kind: "chosen_choices", selectedChoiceIds: [...draft.selectedChoiceIds, choiceId] };
}

/**
 * The answer the lesson would accept, or null while the draft is not answerable
 * yet. The page uses null to keep the send button off rather than letting the
 * lesson refuse the message.
 */
export function quizAnswerSubmissionFrom(
  beat: BrowserQuizBeat,
  draft: QuizAnswerDraft,
): QuizAnswerSubmission | null {
  switch (beat.answerFormat) {
    case "multiple_choice":
      if (draft.kind !== "chosen_choices") {
        return null;
      }
      return chosenChoicesSubmission(
        beat.choices.map((choice) => choice.choiceId),
        draft.selectedChoiceIds,
      );
    case "short_text":
      return draft.kind === "written_answer" ? writtenAnswerSubmission(draft.text) : null;
  }
}

function chosenChoicesSubmission(
  offeredChoiceIds: readonly string[],
  selectedChoiceIds: readonly string[],
): QuizAnswerSubmission | null {
  if (selectedChoiceIds.length === 0 || selectedChoiceIds.length > MAXIMUM_SELECTED_CHOICE_COUNT) {
    return null;
  }
  for (const choiceId of selectedChoiceIds) {
    if (!offeredChoiceIds.includes(choiceId)) {
      return null;
    }
  }
  return { format: "multiple_choice", selectedChoiceIds };
}

function writtenAnswerSubmission(text: string): QuizAnswerSubmission | null {
  const answer = text.trim();
  if (answer.length === 0 || answer.length > MAXIMUM_ANSWER_CHARACTERS) {
    return null;
  }
  return { format: "short_text", text: answer };
}
