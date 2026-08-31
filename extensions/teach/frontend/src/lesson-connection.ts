import type { LessonClientMessage, LessonServerMessage } from "../../shared/protocol.ts";

/**
 * The lesson page's one connection to the lesson server, and what it does when that
 * connection drops.
 *
 * A lesson runs for as long as the learner is being taught, and a WebSocket on a
 * laptop does not: the machine sleeps, the network changes, the socket closes. The
 * page used to open one socket and, when it closed, show "the lesson server is gone"
 * for ever — even though the lesson server was still there, one reconnect away.
 *
 * So it reconnects, and three rules keep that from being worse than not reconnecting
 * at all:
 *
 * - **It is bounded.** Each attempt waits longer than the last, up to a ceiling, and
 *   after a fixed number of attempts it stops and says the lesson server is gone. A
 *   page that retries for ever against a lesson server that has really shut down
 *   keeps the learner's laptop awake and never tells them the truth.
 * - **The old socket is let go completely.** Its listeners come off before the next
 *   one is opened, so a socket that closes slowly cannot deliver a message that the
 *   page then applies for a second time.
 * - **A reconnect restores the whole lesson, rather than adding to it.** The lesson
 *   server sends the whole lesson state when a page connects, so the page is told to
 *   start from that state rather than to append to what it already had.
 *
 * Nothing here is React, so what happens on a drop can be tested without a browser.
 */

export type SocketState = "connecting" | "open" | "closed";

export type LessonWebSocketEventType = "open" | "close" | "message";

/** The little of `WebSocket` this needs. Lets a test drive a drop by hand. */
export interface LessonWebSocket {
  readonly readyState: number;
  addEventListener(
    type: LessonWebSocketEventType,
    listener: (event: MessageEvent) => void,
  ): void;
  removeEventListener(
    type: LessonWebSocketEventType,
    listener: (event: MessageEvent) => void,
  ): void;
  send(text: string): void;
  close(): void;
}

export type LessonWebSocketFactory = (url: string) => LessonWebSocket;

/** `WebSocket.OPEN`, written here so this module needs no browser to be read. */
const SOCKET_IS_OPEN = 1;

/** After this many failed attempts the lesson server really has gone. */
export const MOST_RECONNECT_ATTEMPTS = 6;

const SHORTEST_RECONNECT_WAIT_MILLISECONDS = 250;
const LONGEST_RECONNECT_WAIT_MILLISECONDS = 8_000;

/**
 * How long to wait before attempt number `attempt`, counting from one. It doubles
 * each time so a lesson server that is restarting is found again quickly, and a
 * lesson server that has stopped is not asked sixty times a minute.
 */
export function reconnectWaitMilliseconds(attempt: number): number {
  const doubled = SHORTEST_RECONNECT_WAIT_MILLISECONDS * 2 ** Math.max(0, attempt - 1);
  return Math.min(LONGEST_RECONNECT_WAIT_MILLISECONDS, doubled);
}

export interface LessonServerConnectionParts {
  readonly url: string;
  readonly createWebSocket: LessonWebSocketFactory;
  /** Schedules the wait before the next attempt, and hands back the way to cancel it. */
  readonly startTimer: (runWhenDue: () => void, milliseconds: number) => () => void;
  readonly onMessage: (message: LessonServerMessage) => void;
  readonly onStateChanged: (state: SocketState) => void;
  /**
   * A reconnect has landed, so whatever the page was holding is from before the drop
   * and the lesson state that is about to arrive is the whole truth.
   */
  readonly onReconnected: () => void;
}

export class LessonServerConnection {
  private readonly parts: LessonServerConnectionParts;
  private socket: LessonWebSocket | null = null;
  private detachListeners: (() => void) | null = null;
  private cancelScheduledAttempt: (() => void) | null = null;
  private failedAttempts = 0;
  private isReconnecting = false;
  private wasClosedByThePage = false;

  constructor(parts: LessonServerConnectionParts) {
    this.parts = parts;
  }

  /** Opens the first socket. Doing this again once closed opens nothing. */
  open(): void {
    if (this.wasClosedByThePage || this.socket !== null) {
      return;
    }
    this.connect();
  }

  send(message: LessonClientMessage): void {
    if (this.socket === null || this.socket.readyState !== SOCKET_IS_OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  /** The page is finished with the lesson server. Nothing reconnects after this. */
  close(): void {
    if (this.wasClosedByThePage) {
      return;
    }
    this.wasClosedByThePage = true;
    this.cancelScheduledAttempt?.();
    this.cancelScheduledAttempt = null;
    const socket = this.letGoOfSocket();
    socket?.close();
    this.parts.onStateChanged("closed");
  }

  private connect(): void {
    this.parts.onStateChanged("connecting");

    const socket = this.parts.createWebSocket(this.parts.url);
    const handleOpen = (): void => this.noteOpened();
    const handleClose = (): void => this.noteClosed();
    const handleMessage = (event: MessageEvent): void => this.noteMessage(event);

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("close", handleClose);
    socket.addEventListener("message", handleMessage);

    this.socket = socket;
    this.detachListeners = () => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("close", handleClose);
      socket.removeEventListener("message", handleMessage);
    };
  }

  private noteOpened(): void {
    const landedAfterADrop = this.isReconnecting;
    this.failedAttempts = 0;
    this.isReconnecting = false;
    this.parts.onStateChanged("open");
    if (landedAfterADrop) {
      this.parts.onReconnected();
    }
  }

  private noteClosed(): void {
    if (this.wasClosedByThePage) {
      return;
    }
    this.letGoOfSocket();

    if (this.failedAttempts >= MOST_RECONNECT_ATTEMPTS) {
      this.parts.onStateChanged("closed");
      return;
    }

    this.failedAttempts += 1;
    this.isReconnecting = true;
    this.parts.onStateChanged("connecting");
    this.cancelScheduledAttempt = this.parts.startTimer(() => {
      this.cancelScheduledAttempt = null;
      if (!this.wasClosedByThePage) {
        this.connect();
      }
    }, reconnectWaitMilliseconds(this.failedAttempts));
  }

  private noteMessage(event: MessageEvent): void {
    let message: LessonServerMessage;
    try {
      message = JSON.parse(String(event.data)) as LessonServerMessage;
    } catch {
      // Only the lesson server is on the other end of this socket, so a message that
      // is not JSON is a bug rather than an attack. Dropping it keeps the lesson on
      // screen; falling over here would take the whole page with it.
      return;
    }
    this.parts.onMessage(message);
  }

  private letGoOfSocket(): LessonWebSocket | null {
    this.detachListeners?.();
    this.detachListeners = null;
    const socket = this.socket;
    this.socket = null;
    return socket;
  }
}
