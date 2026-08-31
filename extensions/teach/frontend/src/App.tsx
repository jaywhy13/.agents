import { useCallback, useEffect, useReducer, useState } from "react";

import { lessonBasePath } from "../../shared/lesson-route.ts";
import type { LessonSetup } from "../../shared/lesson.ts";
import { INITIAL_SETUP_PROGRESS, nextSetupProgress } from "../../shared/setup-progress.ts";
import { LessonView } from "./LessonView.tsx";
import { useLessonSocket } from "./lesson-socket.ts";
import { SetupForm } from "./SetupForm.tsx";
import { useLessonVoice } from "./voice/use-lesson-voice.ts";

export function App() {
  const lesson = useLessonSocket();
  const [suggestedTopic, setSuggestedTopic] = useState<string | null>(null);
  // Null until the lesson server has answered. Voice needs a credential the page
  // never sees, so only the server can say whether this lesson has any.
  const [serverHasVoice, setServerHasVoice] = useState<boolean | null>(null);
  const [setupProgress, recordSetupEvent] = useReducer(
    nextSetupProgress,
    INITIAL_SETUP_PROGRESS,
  );

  useEffect(() => {
    let wasCancelled = false;
    const basePath = lessonBasePath(window.location.pathname);
    void fetch(`${basePath}api/setup`)
      .then((response) =>
        response.ok ? response.json() : { suggestedTopic: null, voiceAvailable: false },
      )
      .then((payload: { suggestedTopic: string | null; voiceAvailable?: boolean }) => {
        if (!wasCancelled) {
          setSuggestedTopic(payload.suggestedTopic);
          setServerHasVoice(payload.voiceAvailable === true);
        }
      })
      .catch(() => {});
    return () => {
      wasCancelled = true;
    };
  }, []);

  // Starting a lesson is a one-way message, so the form is told to stop waiting by
  // whatever comes back: the lesson itself, an error, or the socket going away.
  const lessonMetadata = lesson.metadata;
  useEffect(() => {
    if (lessonMetadata !== null) {
      recordSetupEvent({ kind: "lesson_started" });
    }
  }, [lessonMetadata]);

  const lessonNotice = lesson.notice;
  useEffect(() => {
    if (lessonNotice?.level === "error") {
      recordSetupEvent({ kind: "start_failed" });
    }
  }, [lessonNotice]);

  const socketState = lesson.socketState;
  useEffect(() => {
    if (socketState === "closed") {
      recordSetupEvent({ kind: "socket_closed" });
    }
  }, [socketState]);

  const isNarrating = lesson.metadata?.status === "teaching";

  // One voice session for the page, and the only owner of the Space key. It speaks
  // narration beats as they arrive and sends back what the learner says.
  const voice = useLessonVoice({
    serverHasVoice,
    beats: lesson.beats,
    lessonStatus: lesson.metadata?.status ?? null,
    socketState: lesson.socketState,
    onTranscript: useCallback(
      (text: string) => {
        // A spoken question is about wherever the lesson had got to, so the newest
        // beat names it, exactly as a typed question does.
        const newestBeatId = lesson.beats[lesson.beats.length - 1]?.beatId ?? "spoken-question";
        lesson.send({ type: "answer", questionId: newestBeatId, text });
      },
      [lesson],
    ),
    onInterruptTurn: useCallback(() => lesson.send({ type: "interrupt" }), [lesson]),
  });

  function startLesson(setup: LessonSetup): void {
    recordSetupEvent({ kind: "start_requested" });
    lesson.send({ type: "start_lesson", setup });
  }

  function showSetupForm(): void {
    // The lesson on screen may still be running, so stop it before it is replaced.
    if (isNarrating) {
      lesson.send({ type: "interrupt" });
    }
    recordSetupEvent({ kind: "setup_form_shown" });
    lesson.showSetupForm();
  }

  // `/teach <topic>` can be run again while a lesson is on screen. The setup form
  // is not mounted then, so the new topic is offered here instead of disappearing.
  const newTopicWaiting =
    lesson.metadata !== null && lesson.suggestedTopicFromCommand !== null
      ? lesson.suggestedTopicFromCommand
      : null;

  return (
    <main className="lesson-page">
      {lesson.socketState === "closed" ? (
        <p className="notice notice-error">
          The lesson server is gone, and reconnecting did not find it. It closes when the pi
          session ends. Run /teach again to start another lesson.
        </p>
      ) : null}

      {lesson.notice === null ? null : (
        <p className={lesson.notice.level === "error" ? "notice notice-error" : "notice"}>
          {lesson.notice.text}
        </p>
      )}

      {newTopicWaiting === null ? null : (
        <p className="notice">
          <span>Pi was asked to teach “{newTopicWaiting}”.</span>{" "}
          <button type="button" className="button" onClick={showSetupForm}>
            Start that lesson instead
          </button>
        </p>
      )}

      {lesson.metadata === null ? (
        <SetupForm
          suggestedTopic={lesson.suggestedTopicFromCommand ?? suggestedTopic}
          isStarting={setupProgress === "starting"}
          onStart={startLesson}
        />
      ) : (
        <LessonView
          metadata={lesson.metadata}
          beats={lesson.beats}
          illustrations={lesson.illustrationsByIllustrationId}
          pendingQuestion={lesson.pendingQuestion}
          quizResultsByQuestionId={lesson.quizResultsByQuestionId}
          voice={voice}
          onContinue={() => lesson.send({ type: "continue" })}
          onInterrupt={() => lesson.send({ type: "interrupt" })}
          onNewLesson={showSetupForm}
          onAsk={(questionId, text) => lesson.send({ type: "answer", questionId, text })}
          onQuizAnswer={(questionId, answer) =>
            lesson.send({ type: "quiz_answer", questionId, answer })
          }
          onDefineSelection={(selectedTerm) =>
            lesson.send({ type: "define_selection", text: selectedTerm })
          }
          onRequestQuiz={() => lesson.send({ type: "request_quiz" })}
          onLearnerSignal={(signal) => lesson.send({ type: "learner_signal", signal })}
        />
      )}
    </main>
  );
}
