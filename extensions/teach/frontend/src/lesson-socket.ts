import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BrowserBeat } from "../../shared/browser-beat.ts";
import { lessonBasePath } from "../../shared/lesson-route.ts";
import type { LessonMetadata } from "../../shared/lesson.ts";
import type {
  LessonClientMessage,
  LessonServerMessage,
  QuizResult,
} from "../../shared/protocol.ts";
import type { IllustrationProgress } from "../../shared/visuals/illustration-state.ts";
import type { SocketState } from "./lesson-connection.ts";
import { LessonServerConnection } from "./lesson-connection.ts";

export type { SocketState } from "./lesson-connection.ts";

export interface LessonNotice {
  readonly level: "info" | "error";
  readonly text: string;
}

export interface PendingQuestion {
  readonly questionId: string;
  readonly prompt: string;
}

export interface LessonSocket {
  readonly socketState: SocketState;
  readonly metadata: LessonMetadata | null;
  readonly beats: readonly BrowserBeat[];
  readonly notice: LessonNotice | null;
  readonly pendingQuestion: PendingQuestion | null;
  /** What came back for every quiz question the learner has answered. */
  readonly quizResultsByQuestionId: ReadonlyMap<string, QuizResult>;
  /** Where each picture in the lesson has got to. */
  readonly illustrationsByIllustrationId: ReadonlyMap<string, IllustrationProgress>;
  readonly suggestedTopicFromCommand: string | null;
  send(message: LessonClientMessage): void;
  /** Clears the lesson on screen so the setup form can start the next one. */
  showSetupForm(): void;
}

/**
 * Holds the lesson state the server sends. Every address the page uses hangs off
 * the token route this page was served from, so the token is never stored anywhere
 * the browser would send it to another program on this machine.
 *
 * The connection underneath reconnects a bounded number of times when the socket
 * drops. A reconnect is not a continuation: the lesson server sends the whole lesson
 * state to a page that connects, so everything held from before the drop is cleared
 * and rebuilt from that message rather than added to.
 */
export function useLessonSocket(): LessonSocket {
  const [socketState, setSocketState] = useState<SocketState>("connecting");
  const [metadata, setMetadata] = useState<LessonMetadata | null>(null);
  const [beats, setBeats] = useState<readonly BrowserBeat[]>([]);
  const [notice, setNotice] = useState<LessonNotice | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
  const [quizResultsByQuestionId, setQuizResultsByQuestionId] = useState<
    ReadonlyMap<string, QuizResult>
  >(() => new Map());
  const [illustrationsByIllustrationId, setIllustrations] = useState<
    ReadonlyMap<string, IllustrationProgress>
  >(() => new Map());
  const [suggestedTopicFromCommand, setSuggestedTopicFromCommand] = useState<string | null>(null);
  const connectionRef = useRef<LessonServerConnection | null>(null);

  const socketUrl = useMemo(
    () => `ws://${window.location.host}${lessonBasePath(window.location.pathname)}socket`,
    [],
  );

  useEffect(() => {
    const connection = new LessonServerConnection({
      url: socketUrl,
      createWebSocket: (url) => new WebSocket(url),
      startTimer: (runWhenDue, milliseconds) => {
        const timer = setTimeout(runWhenDue, milliseconds);
        return () => clearTimeout(timer);
      },
      onStateChanged: setSocketState,
      onMessage: applyServerMessage,
      onReconnected: forgetEverythingFromBeforeTheDrop,
    });
    connectionRef.current = connection;
    connection.open();

    return () => {
      connectionRef.current = null;
      connection.close();
    };

    /**
     * What the page held is from before the drop, and the lesson server is about to
     * send the whole lesson state. Anything left here would be shown twice or would
     * outlive the lesson it belonged to.
     */
    function forgetEverythingFromBeforeTheDrop(): void {
      setBeats([]);
      setPendingQuestion(null);
      setNotice(null);
      setQuizResultsByQuestionId(new Map());
      setIllustrations(new Map());
    }

    function applyServerMessage(message: LessonServerMessage): void {
      switch (message.type) {
        case "lesson_state":
          setMetadata(message.metadata);
          setBeats(message.beats);
          setQuizResultsByQuestionId(
            new Map(message.quizResults.map((result) => [result.questionId, result])),
          );
          setIllustrations(
            new Map(message.illustrations.map((state) => [state.illustrationId, state])),
          );
          return;
        case "beat":
          setBeats((current) => [...current, message.beat]);
          setPendingQuestion(null);
          return;
        case "question":
          setPendingQuestion({ questionId: message.questionId, prompt: message.prompt });
          return;
        case "status":
          setMetadata((current) => (current === null ? current : { ...current, status: message.status }));
          return;
        case "quiz_result":
          setQuizResultsByQuestionId(
            (current) => new Map(current).set(message.result.questionId, message.result),
          );
          return;
        case "illustration":
          setIllustrations((current) =>
            new Map(current).set(message.state.illustrationId, message.state),
          );
          return;
        case "suggested_topic":
          setSuggestedTopicFromCommand(message.topic);
          return;
        case "notice":
          setNotice({ level: message.level, text: message.text });
          return;
      }
    }
  }, [socketUrl]);

  const send = useCallback((message: LessonClientMessage) => {
    connectionRef.current?.send(message);
  }, []);

  const showSetupForm = useCallback(() => {
    setMetadata(null);
    setBeats([]);
    setPendingQuestion(null);
    setQuizResultsByQuestionId(new Map());
    setIllustrations(new Map());
    setNotice(null);
  }, []);

  return {
    socketState,
    metadata,
    beats,
    notice,
    pendingQuestion,
    quizResultsByQuestionId,
    illustrationsByIllustrationId,
    suggestedTopicFromCommand,
    send,
    showSetupForm,
  };
}
