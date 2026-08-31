import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";

import { WebSocketServer } from "ws";

import { beatsForBrowser } from "../../shared/browser-beat.ts";
import { parseClientMessage } from "../../shared/client-message.ts";
import { lessonRoutePath } from "../../shared/lesson-route.ts";
import type { LessonTranscript } from "../../shared/lesson.ts";
import type { LessonClientMessage, LessonServerMessage } from "../../shared/protocol.ts";
import { quizResultsFromAttempts } from "../../shared/quiz-replay.ts";
import { InvalidClientMessageError } from "../../shared/protocol.ts";
import type { LessonConductor } from "../services/lesson-conductor.ts";
import { createAccessToken } from "./access-token.ts";
import { ConnectionHub, type LessonConnection } from "./connection-hub.ts";
import {
  type GuardDecision,
  LOOPBACK_ADDRESS,
  RequestGuard,
  securityResponseHeaders,
} from "./request-guard.ts";
import {
  MAXIMUM_SOCKET_MESSAGE_BYTES,
  toLessonConnection,
} from "./lesson-socket.ts";
import type { LessonImagePort, LessonVoicePort } from "./lesson-media.ts";
import { readRequestBody } from "./request-body.ts";
import type { StaticAssetRepository } from "./static-asset-repository.ts";

export const LESSON_SOCKET_PATH = "/socket";
export const LESSON_STATE_PATH = "/api/lesson";
export const LESSON_SETUP_PATH = "/api/setup";
export const VOICE_TRANSCRIBE_PATH = "/api/voice/transcribe";
export const VOICE_NARRATION_PATH_PREFIX = "/api/voice/narration/";
export const LESSON_IMAGE_PATH_PREFIX = "/api/images/";

/** One learner answer, matching the transcription client's own upload limit. */
export const LARGEST_UPLOADED_RECORDING_BYTES = 8 * 1024 * 1024;
export const UPLOAD_READ_TIMEOUT_MILLISECONDS = 30_000;

/** A beat id is a UUID or a short slug. It is never a path segment of its own. */
const BEAT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
/** The content hash of the illustration request, so it can never climb a directory. */
const ILLUSTRATION_FILE_PATTERN = /^([a-f0-9]{64})\.png$/;

export interface LessonServerOptions {
  readonly conductor: LessonConductor;
  readonly connectionHub: ConnectionHub;
  readonly staticAssetRepository: StaticAssetRepository;
  readonly accessToken?: string;
  /** Prefills the topic box on the setup form, from `/teach <topic>`. */
  readonly suggestedTopic?: string;
  /** Null when the lesson has no voice, which it says on the page. */
  readonly voice?: LessonVoicePort | null;
  /** Null when the lesson cannot draw pictures. */
  readonly images?: LessonImagePort | null;
  readonly onError?: (error: Error) => void;
}

export interface RunningLessonServer {
  readonly url: string;
  readonly port: number;
  readonly accessToken: string;
}

export class LessonServerStoppedError extends Error {
  constructor() {
    super("This lesson server has been stopped. Build a new one to serve another lesson.");
    this.name = "LessonServerStoppedError";
  }
}

/**
 * The lesson page's own web server. It listens on the loopback address only, on a
 * free port the operating system picks, and every request must carry the lesson
 * token in its path.
 */
export class LessonServer {
  private readonly conductor: LessonConductor;
  private readonly connectionHub: ConnectionHub;
  private readonly staticAssetRepository: StaticAssetRepository;
  private readonly accessToken: string;
  private suggestedTopic: string | null;
  private readonly voice: LessonVoicePort | null;
  private readonly images: LessonImagePort | null;
  private readonly onError: (error: Error) => void;
  /**
   * The newest message the page sent, and everything before it. Client messages are
   * handled one after another, so a Continue and an answer that arrive in the same
   * moment cannot both find the lesson idle and both start a turn.
   */
  private handlingClientMessages: Promise<void> = Promise.resolve();
  private readonly httpServer: Server;
  private readonly webSocketServer: WebSocketServer;
  private guard: RequestGuard | null = null;
  private running: RunningLessonServer | null = null;
  private hasStopped = false;

  constructor(options: LessonServerOptions) {
    this.conductor = options.conductor;
    this.connectionHub = options.connectionHub;
    this.staticAssetRepository = options.staticAssetRepository;
    this.accessToken = options.accessToken ?? createAccessToken();
    this.suggestedTopic = options.suggestedTopic ?? null;
    this.voice = options.voice ?? null;
    this.images = options.images ?? null;
    this.onError = options.onError ?? (() => {});
    this.httpServer = createServer((request, response) => {
      void this.handleRequest(request, response);
    });
    this.webSocketServer = new WebSocketServer({
      noServer: true,
      maxPayload: MAXIMUM_SOCKET_MESSAGE_BYTES,
    });
    this.httpServer.on("upgrade", (request, socket, head) => {
      this.handleUpgrade(request, socket as Duplex, head);
    });
    // A socket error after listening would otherwise be an unhandled 'error' event,
    // which ends the whole pi process.
    this.httpServer.on("clientError", (_cause, socket) => socket.destroy());
    this.httpServer.on("error", (cause) => this.onError(asError(cause)));
    this.webSocketServer.on("error", (cause) => this.onError(asError(cause)));
  }

  async start(): Promise<RunningLessonServer> {
    if (this.running !== null) {
      return this.running;
    }
    // A stopped `ws` server cannot be reopened, so say so rather than half start.
    if (this.hasStopped) {
      throw new LessonServerStoppedError();
    }

    await new Promise<void>((resolve, reject) => {
      this.httpServer.once("error", reject);
      this.httpServer.listen(0, LOOPBACK_ADDRESS, () => {
        this.httpServer.removeListener("error", reject);
        resolve();
      });
    });

    const port = (this.httpServer.address() as AddressInfo).port;
    this.guard = new RequestGuard({ accessToken: this.accessToken, port });
    this.running = {
      port,
      accessToken: this.accessToken,
      url: `http://${LOOPBACK_ADDRESS}:${port}${lessonRoutePath(this.accessToken)}`,
    };
    return this.running;
  }

  /** `/teach <topic>` can be run again while the lesson page is already open. */
  setSuggestedTopic(topic: string | null): void {
    this.suggestedTopic = topic;
    if (topic !== null) {
      this.connectionHub.broadcast({ type: "suggested_topic", topic });
    }
  }

  async stop(): Promise<void> {
    this.hasStopped = true;
    this.connectionHub.closeAll();
    this.running = null;
    this.guard = null;
    await new Promise<void>((resolve) => {
      this.webSocketServer.close(() => resolve());
      for (const webSocket of this.webSocketServer.clients) {
        webSocket.terminate();
      }
    });
    await new Promise<void>((resolve) => {
      this.httpServer.close(() => resolve());
      this.httpServer.closeAllConnections();
    });
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const port = this.running?.port ?? 0;
    const requestUrl = request.url ?? "/";

    const decision = this.checkRequest(request, requestUrl);
    if (!decision.allowed) {
      this.respondWithText(response, decision.statusCode, decision.reason, port);
      return;
    }

    const isRead = request.method === "GET" || request.method === "HEAD";
    // One address takes a body: the recording the learner just made. Everything else
    // on this server is a read.
    if (request.method === "POST" && decision.lessonPath === VOICE_TRANSCRIBE_PATH) {
      await this.respondWithTranscript(request, response, port);
      return;
    }
    if (!isRead) {
      this.respondWithText(response, 405, "Only GET is supported at this address.", port);
      return;
    }

    if (decision.needsTrailingSlash) {
      // The built page links to its assets with relative addresses, so they only
      // resolve inside the token route when the page address ends in a slash.
      this.redirectToLessonPage(response, port);
      return;
    }

    const lessonPath = decision.lessonPath;
    if (lessonPath === LESSON_STATE_PATH) {
      await this.respondWithLessonState(response, port);
      return;
    }
    if (lessonPath === LESSON_SETUP_PATH) {
      // Voice availability is answered here, before the first beat, so the page can
      // say voice is off up front rather than after the first narration is refused.
      this.respondWithJson(
        response,
        {
          suggestedTopic: this.suggestedTopic,
          voiceAvailable: this.voice !== null && this.voice.isAvailable,
        },
        port,
      );
      return;
    }
    if (lessonPath.startsWith(VOICE_NARRATION_PATH_PREFIX)) {
      await this.respondWithNarrationAudio(
        lessonPath.slice(VOICE_NARRATION_PATH_PREFIX.length),
        response,
        port,
      );
      return;
    }
    if (lessonPath.startsWith(LESSON_IMAGE_PATH_PREFIX)) {
      await this.respondWithIllustration(
        lessonPath.slice(LESSON_IMAGE_PATH_PREFIX.length),
        response,
        port,
      );
      return;
    }

    await this.respondWithStaticAsset(lessonPath, response, port);
  }

  /**
   * Takes the recording the learner just made and hands back the words. The audio is
   * read within a budget, forwarded to the proxy, and dropped; nothing is written to
   * disk and nothing leaves this machine except the request to the proxy.
   */
  private async respondWithTranscript(
    request: IncomingMessage,
    response: ServerResponse,
    port: number,
  ): Promise<void> {
    const voice = this.voice;
    if (voice === null || !voice.isAvailable) {
      this.respondWithText(response, 503, "This lesson has no voice.", port);
      return;
    }

    const mimeType = firstHeaderValue(request.headers["content-type"]);
    if (mimeType === undefined) {
      this.respondWithText(response, 415, "Say what the recording is with Content-Type.", port);
      return;
    }

    const body = await readRequestBody(request, {
      largestBytes: LARGEST_UPLOADED_RECORDING_BYTES,
      timeoutMilliseconds: UPLOAD_READ_TIMEOUT_MILLISECONDS,
    });
    switch (body.kind) {
      case "too_large":
        this.respondWithText(
          response,
          413,
          `A recording must be at most ${body.limitBytes} bytes.`,
          port,
        );
        return;
      case "timed_out":
        this.respondWithText(response, 408, "The recording stopped arriving.", port);
        return;
      case "failed":
        this.respondWithText(response, 400, "The recording could not be read.", port);
        return;
      case "read":
        break;
    }

    let outcome: Awaited<ReturnType<LessonVoicePort["transcribe"]>>;
    try {
      outcome = await voice.transcribe({ audio: body.bytes, mimeType });
    } catch (cause) {
      this.onError(asError(cause));
      this.respondWithText(response, 502, "The recording could not be transcribed.", port);
      return;
    }

    switch (outcome.kind) {
      case "transcribed":
        this.respondWithJson(response, { text: outcome.text }, port);
        return;
      case "unavailable":
        this.respondWithText(response, 503, outcome.reason, port);
        return;
      case "refused":
        this.respondWithText(response, 415, outcome.reason, port);
        return;
      case "failed":
        this.respondWithText(response, 502, outcome.reason, port);
        return;
    }
  }

  /** The spoken lines for one narration beat, in the order they are said. */
  private async respondWithNarrationAudio(
    beatId: string,
    response: ServerResponse,
    port: number,
  ): Promise<void> {
    const voice = this.voice;
    if (voice === null || !voice.isAvailable) {
      this.respondWithText(response, 503, "This lesson has no voice.", port);
      return;
    }
    if (!BEAT_ID_PATTERN.test(beatId)) {
      this.respondWithText(response, 404, "Not found.", port);
      return;
    }

    let outcome: Awaited<ReturnType<LessonVoicePort["narrationFor"]>>;
    try {
      outcome = await voice.narrationFor(beatId);
    } catch (cause) {
      this.onError(asError(cause));
      this.respondWithText(response, 502, "The lesson could not be spoken.", port);
      return;
    }

    switch (outcome.kind) {
      case "ready":
        this.respondWithJson(response, outcome.audio, port);
        return;
      case "unavailable":
        this.respondWithText(response, 503, outcome.reason, port);
        return;
      case "unknown_beat":
        this.respondWithText(response, 404, "Not found.", port);
        return;
      case "failed":
        this.respondWithText(response, 502, outcome.reason, port);
        return;
    }
  }

  /**
   * The bytes of one generated picture. The name in the address must be the content
   * hash of the request that made it, so nothing here can be turned into a path.
   */
  private async respondWithIllustration(
    fileName: string,
    response: ServerResponse,
    port: number,
  ): Promise<void> {
    const images = this.images;
    const matched = ILLUSTRATION_FILE_PATTERN.exec(fileName);
    if (images === null || matched === null || matched[1] === undefined) {
      this.respondWithText(response, 404, "Not found.", port);
      return;
    }

    let bytes: Uint8Array | null;
    try {
      bytes = await images.readBytes(matched[1]);
    } catch (cause) {
      this.onError(asError(cause));
      this.respondWithText(response, 500, "That picture could not be read.", port);
      return;
    }

    if (bytes === null) {
      this.respondWithText(response, 404, "Not found.", port);
      return;
    }

    response.writeHead(200, {
      ...securityResponseHeaders(port),
      "Content-Type": "image/png",
      "Content-Length": String(bytes.byteLength),
    });
    response.end(bytes);
  }

  private redirectToLessonPage(response: ServerResponse, port: number): void {
    response.writeHead(302, {
      ...securityResponseHeaders(port),
      Location: lessonRoutePath(this.accessToken),
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("The lesson page lives one slash further on.");
  }

  private async respondWithLessonState(response: ServerResponse, port: number): Promise<void> {
    let payload: string;
    try {
      const transcript = await this.conductor.getTranscript();
      payload = JSON.stringify(
        transcript === null
          ? { metadata: null, beats: [], quizResults: [], illustrations: [] }
          : lessonStateFor(transcript),
      );
    } catch (cause) {
      this.onError(asError(cause));
      this.respondWithText(response, 500, "The lesson could not be read.", port);
      return;
    }

    response.writeHead(200, {
      ...securityResponseHeaders(port),
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(payload);
  }

  private respondWithJson(response: ServerResponse, payload: unknown, port: number): void {
    response.writeHead(200, {
      ...securityResponseHeaders(port),
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(payload));
  }

  private async respondWithStaticAsset(
    requestPath: string,
    response: ServerResponse,
    port: number,
  ): Promise<void> {
    // There is no fallback to the lesson page for an unknown path. The built page
    // links to its assets relatively, so a page served at a deeper address would
    // look for its script one level too far down and come up blank.
    const asset = await this.staticAssetRepository.get(requestPath);

    if (asset === null) {
      this.respondWithText(response, 404, "Not found.", port);
      return;
    }

    // No cookie is ever set: a cookie on 127.0.0.1 is sent to every other local
    // program, whatever port it listens on. The token stays in the path instead.
    response.writeHead(200, {
      ...securityResponseHeaders(port),
      "Content-Type": asset.contentType,
    });
    response.end(asset.bytes);
  }

  private respondWithText(
    response: ServerResponse,
    statusCode: number,
    text: string,
    port: number,
  ): void {
    response.writeHead(statusCode, {
      ...securityResponseHeaders(port),
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end(text);
  }

  private handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const decision = this.checkRequest(request, request.url ?? "/");
    if (!decision.allowed) {
      rejectUpgrade(socket, decision.statusCode);
      return;
    }
    if (decision.lessonPath !== LESSON_SOCKET_PATH) {
      rejectUpgrade(socket, 404);
      return;
    }

    this.webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      const connection = toLessonConnection(webSocket, {
        onText: (text) => {
          this.handleClientText(text);
        },
        onClose: (closedConnection: LessonConnection) => {
          this.connectionHub.remove(closedConnection);
        },
      });
      this.connectionHub.add(connection);
      void this.sendLessonStateTo(connection);
    });
  }

  private async sendLessonStateTo(connection: LessonConnection): Promise<void> {
    try {
      const transcript = await this.conductor.getTranscript();
      if (transcript === null) {
        return;
      }
      const message: LessonServerMessage = {
        type: "lesson_state",
        ...lessonStateFor(transcript),
      };
      connection.send(JSON.stringify(message));
    } catch (cause) {
      this.onError(asError(cause));
    }
  }

  /**
   * Client messages are handled one after another, never side by side.
   *
   * Two messages can arrive in the same tick — Continue clicked while an answer is
   * still in flight, or two browsers watching the same lesson. Each handler reads
   * whether the lesson is teaching and then starts a turn, so two running together
   * could both see an idle lesson. Queueing them means the second one sees what the
   * first one did.
   */
  private handleClientText(text: string): void {
    // Nothing awaits this, so the queue must never hold a rejection:
    // `handleOneClientText` reports every failure itself, and a rejected queue would
    // refuse every later message the page sends.
    this.handlingClientMessages = this.handlingClientMessages
      .then(() => this.handleOneClientText(text))
      .catch((cause: unknown) => {
        this.onError(asError(cause));
      });
  }

  private async handleOneClientText(text: string): Promise<void> {
    let message: LessonClientMessage;
    try {
      message = parseClientMessage(JSON.parse(text));
    } catch (cause) {
      const reason = cause instanceof InvalidClientMessageError ? cause.message : "Bad message.";
      this.connectionHub.broadcast({ type: "notice", level: "error", text: reason });
      return;
    }

    try {
      await this.dispatchClientMessage(message);
    } catch (cause) {
      this.onError(asError(cause));
      this.connectionHub.broadcast({
        type: "notice",
        level: "error",
        text: "The lesson hit a problem. Look at the pi session for details.",
      });
    }
  }

  private async dispatchClientMessage(message: LessonClientMessage): Promise<void> {
    switch (message.type) {
      case "start_lesson":
        await this.conductor.startLesson(message.setup);
        return;
      case "answer":
        await this.conductor.answerQuestion(message.questionId, message.text);
        return;
      case "quiz_answer":
        await this.conductor.submitQuizAnswer(message.questionId, message.answer);
        return;
      case "define_selection":
        await this.conductor.requestDefinition(message.text);
        return;
      case "request_quiz":
        await this.conductor.requestQuiz();
        return;
      case "learner_signal":
        await this.conductor.recordLearnerSignal(message.signal);
        return;
      case "continue":
        await this.conductor.continueLesson();
        return;
      case "interrupt":
        await this.conductor.interrupt();
        return;
    }
  }

  private checkRequest(request: IncomingMessage, requestUrl: string): GuardDecision {
    if (this.guard === null) {
      return { allowed: false, statusCode: 403, reason: "The lesson server is not running." };
    }
    return this.guard.check({ headers: request.headers, requestUrl });
  }
}

/**
 * What the page is told a lesson is. The stored transcript holds how the learner
 * answered; the page only needs what each answer was marked as, so the two read
 * paths turn it into the same shape here.
 *
 * The beats go through `beatsForBrowser`, so a quiz beat's answer key is dropped
 * before the state leaves the server. Both read paths — the socket's opening
 * message and the lesson state address — come through here, so neither can forget.
 */
function lessonStateFor(transcript: LessonTranscript) {
  return {
    metadata: transcript.metadata,
    beats: beatsForBrowser(transcript.beats),
    quizResults: quizResultsFromAttempts(transcript.beats, transcript.quizAttempts),
    illustrations: transcript.illustrations,
  };
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value.length === 1 ? value[0] : undefined;
  }
  return value;
}

const UPGRADE_REJECTION_REASONS: Readonly<Record<number, string>> = {
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
};

function rejectUpgrade(socket: Duplex, statusCode: number): void {
  const statusText = UPGRADE_REJECTION_REASONS[statusCode] ?? "Bad Request";
  socket.write(
    `HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
  socket.destroy();
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
