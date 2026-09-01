import type {
  LessonWebSocket,
  LessonWebSocketEventType,
} from "../../frontend/src/lesson-connection.ts";

/**
 * A WebSocket the test drives by hand.
 *
 * It counts its listeners, because the failure the reconnecting connection has to
 * avoid is a socket that is replaced while its listeners are still attached: the
 * page then applies every message twice and never notices.
 */
export class FakeLessonWebSocket implements LessonWebSocket {
  static readonly OPEN = 1;

  readyState = 0;
  closeCount = 0;
  readonly sentMessages: string[] = [];
  private readonly listenersByType = new Map<
    LessonWebSocketEventType,
    Array<(event: MessageEvent) => void>
  >();
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  get connectedUrl(): string {
    return this.url;
  }

  addEventListener(
    type: LessonWebSocketEventType,
    listener: (event: MessageEvent) => void,
  ): void {
    const listeners = this.listenersByType.get(type) ?? [];
    listeners.push(listener);
    this.listenersByType.set(type, listeners);
  }

  removeEventListener(
    type: LessonWebSocketEventType,
    listener: (event: MessageEvent) => void,
  ): void {
    const listeners = this.listenersByType.get(type) ?? [];
    const at = listeners.indexOf(listener);
    if (at >= 0) {
      listeners.splice(at, 1);
    }
  }

  send(text: string): void {
    this.sentMessages.push(text);
  }

  close(): void {
    this.closeCount += 1;
  }

  get listenerCount(): number {
    let total = 0;
    for (const listeners of this.listenersByType.values()) {
      total += listeners.length;
    }
    return total;
  }

  reportOpen(): void {
    this.readyState = FakeLessonWebSocket.OPEN;
    this.fire("open", {} as MessageEvent);
  }

  reportMessage(payload: unknown): void {
    this.fire("message", { data: JSON.stringify(payload) } as MessageEvent);
  }

  reportClose(): void {
    this.readyState = 3;
    this.fire("close", {} as MessageEvent);
  }

  private fire(type: LessonWebSocketEventType, event: MessageEvent): void {
    for (const listener of [...(this.listenersByType.get(type) ?? [])]) {
      listener(event);
    }
  }
}

export interface ScheduledReconnect {
  readonly milliseconds: number;
  fire(): void;
}

/** Records the sockets that were opened and the waits between them. */
export class FakeSocketWorld {
  readonly sockets: FakeLessonWebSocket[] = [];
  readonly waits: ScheduledReconnect[] = [];

  readonly createWebSocket = (url: string): LessonWebSocket => {
    const socket = new FakeLessonWebSocket(url);
    this.sockets.push(socket);
    return socket;
  };

  readonly startTimer = (runWhenDue: () => void, milliseconds: number): (() => void) => {
    let wasCancelled = false;
    this.waits.push({
      milliseconds,
      fire: () => {
        if (!wasCancelled) {
          runWhenDue();
        }
      },
    });
    return () => {
      wasCancelled = true;
    };
  };

  get newestSocket(): FakeLessonWebSocket {
    const socket = this.sockets[this.sockets.length - 1];
    if (socket === undefined) {
      throw new Error("No socket has been opened yet.");
    }
    return socket;
  }

  /** Waits out the newest scheduled reconnect, so the next attempt is made. */
  waitForTheNextAttempt(): void {
    const wait = this.waits[this.waits.length - 1];
    if (wait === undefined) {
      throw new Error("No reconnect has been scheduled.");
    }
    wait.fire();
  }

  get waitedMilliseconds(): readonly number[] {
    return this.waits.map((wait) => wait.milliseconds);
  }
}
