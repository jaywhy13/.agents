import { useMemo, useState } from "react";

import type { BrowserBeat } from "../../shared/browser-beat.ts";
import { beatsShownOnScreen } from "../../shared/beats-on-screen.ts";
import { glossaryFromBeats } from "../../shared/glossary.ts";
import type { LearnerSignalKind } from "../../shared/learner-history.ts";
import type { LessonMetadata } from "../../shared/lesson.ts";
import type { QuizAnswerSubmission, QuizResult } from "../../shared/protocol.ts";
import type { IllustrationProgress } from "../../shared/visuals/illustration-state.ts";
import { BeatView } from "./beats/BeatView.tsx";
import { GlossaryContext } from "./glossary-context.ts";
import { GlossaryPanel } from "./GlossaryPanel.tsx";
import { IllustrationContext } from "./illustration-context.ts";
import type { PendingQuestion } from "./lesson-socket.ts";
import { QuizAnsweringContext } from "./quiz-context.ts";
import { useDefinableSelection } from "./use-definable-selection.ts";
import type { LessonVoice } from "./voice/use-lesson-voice.ts";

export interface LessonViewProps {
  readonly metadata: LessonMetadata;
  readonly beats: readonly BrowserBeat[];
  readonly illustrations: ReadonlyMap<string, IllustrationProgress>;
  readonly pendingQuestion: PendingQuestion | null;
  readonly quizResultsByQuestionId: ReadonlyMap<string, QuizResult>;
  readonly voice: LessonVoice;
  readonly onContinue: () => void;
  readonly onInterrupt: () => void;
  /** Puts the setup form back, so the learner can be taught something else. */
  readonly onNewLesson: () => void;
  readonly onAsk: (beatTheLearnerIsAskingAbout: string, text: string) => void;
  readonly onQuizAnswer: (questionId: string, submission: QuizAnswerSubmission) => void;
  /** Asks the lesson what the words the learner highlighted mean. */
  readonly onDefineSelection: (selectedTerm: string) => void;
  /** Asks the lesson for a question about what it has taught so far. */
  readonly onRequestQuiz: () => void;
  /**
   * Tells the lesson what the learner wants in as many words. The lesson adapts to
   * this rather than guessing at a mood from how they answered.
   */
  readonly onLearnerSignal: (signal: LearnerSignalKind) => void;
}

export function LessonView({
  metadata,
  beats,
  illustrations,
  pendingQuestion,
  quizResultsByQuestionId,
  voice,
  onContinue,
  onInterrupt,
  onNewLesson,
  onAsk,
  onQuizAnswer,
  onDefineSelection,
  onRequestQuiz,
  onLearnerSignal,
}: LessonViewProps) {
  const [questionDraft, setQuestionDraft] = useState("");
  const isTeaching = metadata.status === "teaching";
  const selectedTerm = useDefinableSelection();

  const glossary = useMemo(() => glossaryFromBeats(beats), [beats]);
  const drawnBeats = useMemo(() => beatsShownOnScreen(beats), [beats]);
  const newestBeatId = drawnBeats[drawnBeats.length - 1]?.beatId ?? metadata.lessonId;

  const quizAnswering = useMemo(
    () => ({
      resultsByQuestionId: quizResultsByQuestionId,
      canAnswer: !isTeaching,
      submitAnswer: onQuizAnswer,
    }),
    [quizResultsByQuestionId, isTeaching, onQuizAnswer],
  );

  function askQuestion(): void {
    const question = questionDraft.trim();
    if (question.length === 0) return;
    // A question the learner typed is about wherever the lesson had got to, so the
    // newest beat names it. There is no separate question to answer.
    onAsk(pendingQuestion?.questionId ?? newestBeatId, question);
    setQuestionDraft("");
  }

  return (
    <GlossaryContext.Provider value={glossary}>
      <QuizAnsweringContext.Provider value={quizAnswering}>
        <IllustrationContext.Provider value={illustrations}>
        <section>
          <h1 className="lesson-title">{metadata.topic}</h1>
          <p className="lesson-subtitle">{lessonStatusLabel(metadata.status)}</p>

          {voice.unavailableReason === null ? null : (
            <p className="notice voice-unavailable">{voice.unavailableReason}</p>
          )}

          {drawnBeats.map((beat) => (
            <BeatView key={beat.beatId} beat={beat} />
          ))}

          <div className="question-box">
            <p>{pendingQuestion?.prompt ?? "Ask about anything you have just seen."}</p>
            <textarea
              className="setup-textarea"
              aria-label="Ask the lesson a question"
              value={questionDraft}
              onChange={(event) => setQuestionDraft(event.target.value)}
            />
            <div className="button-row">
              <button
                type="button"
                className="button button-primary"
                disabled={isTeaching || questionDraft.trim().length === 0}
                onClick={askQuestion}
              >
                Ask
              </button>
            </div>
          </div>

          <GlossaryPanel entries={glossary} />

          {/*
            What the learner wants, said outright. The lesson reads how they answered
            and how long they waited, but both of those are guesses; these three say
            exactly what to do next and are kept with the lesson.
          */}
          <div className="button-row learner-controls">
            <button
              type="button"
              className="button"
              disabled={isTeaching}
              onClick={() => onLearnerSignal("simpler")}
            >
              Simpler
            </button>
            <button
              type="button"
              className="button"
              disabled={isTeaching}
              onClick={() => onLearnerSignal("go_deeper")}
            >
              Go deeper
            </button>
            <button
              type="button"
              className="button"
              disabled={isTeaching}
              onClick={onRequestQuiz}
            >
              Quiz me
            </button>
          </div>

          <div className="button-row">
            <button
              type="button"
              className="button button-primary"
              disabled={isTeaching}
              onClick={onContinue}
            >
              Continue
            </button>
            <button
              type="button"
              className="button button-danger"
              disabled={!isTeaching}
              onClick={onInterrupt}
            >
              Stop now
            </button>
            <button type="button" className="button" onClick={onNewLesson}>
              Teach something else
            </button>
          </div>

          {selectedTerm === null || isTeaching ? null : (
            <div className="selection-bar">
              <button
                type="button"
                className="button button-primary"
                // Pressing a button clears the highlight, so the press is kept off
                // the selection until the click has been handled.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onDefineSelection(selectedTerm)}
              >
                What does “{selectedTerm}” mean?
              </button>
            </div>
          )}

          <div className="status-bar">
            <span
              className={voice.view.state === "listening" ? "status-recording" : undefined}
              role="status"
            >
              {voice.isAvailable ? voice.view.statusLabel : "Voice is off"}
            </span>
            {voice.isAvailable ? (
              <>
                {voice.view.state === "speaking" || voice.view.isAudioPaused ? (
                  <button
                    type="button"
                    className="button voice-button"
                    onClick={() => (voice.view.isAudioPaused ? voice.resume() : voice.pause())}
                  >
                    {voice.view.isAudioPaused ? "Resume speaking" : "Pause speaking"}
                  </button>
                ) : null}
                <span>
                  <span className="hotkey">Space</span> interrupt and speak
                </span>
                <span>
                  <span className="hotkey">Space</span> again to send
                </span>
                <span>
                  <span className="hotkey">Esc</span> cancel
                </span>
              </>
            ) : null}
          </div>

          {voice.view.error === null ? null : (
            <p className="notice notice-error voice-error">{voice.view.error}</p>
          )}
        </section>
        </IllustrationContext.Provider>
      </QuizAnsweringContext.Provider>
    </GlossaryContext.Provider>
  );
}

function lessonStatusLabel(status: LessonMetadata["status"]): string {
  switch (status) {
    case "setup":
      return "Getting ready.";
    case "teaching":
      return "Teaching now.";
    case "paused":
      return "Paused, waiting for you.";
    case "finished":
      return "Finished. Press Continue for more.";
    case "aborted":
      return "Stopped. Press Continue to carry on.";
  }
}


