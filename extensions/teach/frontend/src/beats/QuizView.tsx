import { useState } from "react";

import type {
  BrowserMultipleChoiceQuizBeat,
  BrowserQuizBeat,
  BrowserShortTextQuizBeat,
} from "../../../shared/browser-beat.ts";
import type { QuizGrade } from "../../../shared/learner-history.ts";
import type { QuizAnswerDraft } from "../../../shared/quiz-answer-draft.ts";
import {
  emptyDraftFor,
  quizAnswerSubmissionFrom,
  withChoiceToggled,
} from "../../../shared/quiz-answer-draft.ts";
import type { QuizResult } from "../../../shared/protocol.ts";
import { useQuizAnswering } from "../quiz-context.ts";
import { ProseView } from "./ProseView.tsx";

export function QuizView({ beat }: { beat: BrowserQuizBeat }) {
  const { resultsByQuestionId, canAnswer, submitAnswer } = useQuizAnswering();
  const [draft, setDraft] = useState<QuizAnswerDraft>(() => emptyDraftFor(beat));
  const [isWaitingForResult, setIsWaitingForResult] = useState(false);

  const result = resultsByQuestionId.get(beat.questionId) ?? null;
  const submission = quizAnswerSubmissionFrom(beat, draft);
  const isAnswered = result !== null;

  function sendAnswer(): void {
    if (submission === null) return;
    setIsWaitingForResult(true);
    submitAnswer(beat.questionId, submission);
  }

  return (
    <article className="beat-card quiz-card">
      <p className="beat-kind-label">Question</p>
      <p className="quiz-question">
        <ProseView text={beat.question} />
      </p>

      {beat.answerFormat === "multiple_choice" ? (
        <QuizChoiceList
          beat={beat}
          draft={draft}
          isAnswered={isAnswered}
          correctChoiceIds={result?.correctChoiceIds ?? []}
          onToggleChoice={(choiceId) => setDraft(withChoiceToggled(draft, choiceId))}
        />
      ) : (
        <QuizWrittenAnswer
          beat={beat}
          draft={draft}
          isAnswered={isAnswered}
          onWrite={(text) => setDraft({ kind: "written_answer", text })}
        />
      )}

      {isAnswered ? (
        <QuizResultView result={result} />
      ) : (
        <div className="button-row">
          <button
            type="button"
            className="button button-primary"
            disabled={submission === null || !canAnswer}
            onClick={sendAnswer}
          >
            Send answer
          </button>
          {isWaitingForResult ? <span className="quiz-waiting">Marking your answer.</span> : null}
        </div>
      )}
    </article>
  );
}

function QuizChoiceList({
  beat,
  draft,
  isAnswered,
  correctChoiceIds,
  onToggleChoice,
}: {
  readonly beat: BrowserMultipleChoiceQuizBeat;
  readonly draft: QuizAnswerDraft;
  readonly isAnswered: boolean;
  readonly correctChoiceIds: readonly string[];
  readonly onToggleChoice: (choiceId: string) => void;
}) {
  const selectedChoiceIds =
    draft.kind === "chosen_choices" ? draft.selectedChoiceIds : ([] as readonly string[]);

  return (
    <ul className="quiz-choices">
      {beat.choices.map((choice) => (
        <li key={choice.choiceId}>
          <label
            className={
              isAnswered && correctChoiceIds.includes(choice.choiceId)
                ? "quiz-choice quiz-choice-correct"
                : "quiz-choice"
            }
          >
            <input
              type="checkbox"
              checked={selectedChoiceIds.includes(choice.choiceId)}
              disabled={isAnswered}
              onChange={() => onToggleChoice(choice.choiceId)}
            />
            <span>{choice.text}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function QuizWrittenAnswer({
  beat,
  draft,
  isAnswered,
  onWrite,
}: {
  readonly beat: BrowserShortTextQuizBeat;
  readonly draft: QuizAnswerDraft;
  readonly isAnswered: boolean;
  readonly onWrite: (text: string) => void;
}) {
  return (
    <textarea
      className="setup-textarea"
      aria-label={beat.question}
      value={draft.kind === "written_answer" ? draft.text : ""}
      disabled={isAnswered}
      onChange={(event) => onWrite(event.target.value)}
    />
  );
}

function QuizResultView({ result }: { readonly result: QuizResult }) {
  return (
    <div className={`quiz-result quiz-result-${result.grade}`}>
      <p className="quiz-grade">{gradeLabel(result.grade)}</p>
      <p className="quiz-explanation">
        <ProseView text={result.explanation} />
      </p>
    </div>
  );
}

/** One explicit branch per grade, so a new grade cannot borrow another's wording. */
function gradeLabel(grade: QuizGrade): string {
  switch (grade) {
    case "correct":
      return "That is right.";
    case "partly_correct":
      return "Partly right.";
    case "incorrect":
      return "Not quite.";
  }
}
