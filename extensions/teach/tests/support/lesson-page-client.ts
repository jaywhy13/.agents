import type { LessonClientMessage, LessonServerMessage } from "../../shared/protocol.ts";

/**
 * Stands in for the learner's browser: it talks to the lesson server over the same
 * WebSocket the real page uses.
 */
export class LessonPageClient {
  private readonly socket: WebSocket;
  private readonly received: LessonServerMessage[] = [];
  private readonly waiters: Array<(message: LessonServerMessage) => void> = [];

  private constructor(socket: WebSocket) {
    this.socket = socket;
    this.socket.addEventListener("message", (event: MessageEvent) => {
      this.received.push(JSON.parse(String(event.data)) as LessonServerMessage);
      this.deliverToWaiters();
    });
  }

  static async connect(socketUrl: string): Promise<LessonPageClient> {
    const socket = new WebSocket(socketUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("The lesson socket was refused.")), {
        once: true,
      });
    });
    return new LessonPageClient(socket);
  }

  send(message: LessonClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  /** Sends raw bytes, so tests can act like a client that ignores the protocol. */
  sendRaw(payload: string | ArrayBuffer): void {
    this.socket.send(payload);
  }

  async waitForClose(timeoutMilliseconds = 2_000): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("The lesson socket stayed open.")),
        timeoutMilliseconds,
      );
      this.socket.addEventListener(
        "close",
        (event: CloseEvent) => {
          clearTimeout(timeout);
          resolve(event.code);
        },
        { once: true },
      );
    });
  }

  async nextMessage(timeoutMilliseconds = 2_000): Promise<LessonServerMessage> {
    return new Promise<LessonServerMessage>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("No message arrived from the lesson server.")),
        timeoutMilliseconds,
      );
      this.waiters.push((message) => {
        clearTimeout(timeout);
        resolve(message);
      });
      this.deliverToWaiters();
    });
  }

  close(): void {
    this.socket.close();
  }

  private deliverToWaiters(): void {
    while (this.waiters.length > 0 && this.received.length > 0) {
      const waiter = this.waiters.shift();
      const message = this.received.shift();
      if (waiter !== undefined && message !== undefined) {
        waiter(message);
      }
    }
  }
}
