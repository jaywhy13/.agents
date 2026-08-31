import type { WebSocket } from "ws";

import type { LessonConnection } from "./connection-hub.ts";

/** The largest message the lesson page may send. Answers are short text. */
export const MAXIMUM_SOCKET_MESSAGE_BYTES = 64 * 1024;

export interface LessonSocketHandlers {
  onText(text: string): void;
  /**
   * The closed connection is handed back, so the caller never has to reach into a
   * variable that is still being assigned while it writes the handler.
   */
  onClose(connection: LessonConnection): void;
}

/**
 * Wraps a `ws` socket as a lesson connection. Binary frames are refused: the
 * lesson protocol is text only, so anything else is a client that does not belong.
 */
export function toLessonConnection(
  webSocket: WebSocket,
  handlers: LessonSocketHandlers,
): LessonConnection {
  const connection: LessonConnection = {
    send(text: string): void {
      if (webSocket.readyState === webSocket.OPEN) {
        webSocket.send(text);
      }
    },
    close(): void {
      webSocket.close(1000, "The lesson is over.");
    },
  };

  webSocket.on("message", (payload: Buffer, isBinary: boolean) => {
    if (isBinary) {
      webSocket.close(1003, "The lesson protocol is text only.");
      return;
    }
    handlers.onText(payload.toString("utf8"));
  });

  webSocket.on("close", () => handlers.onClose(connection));
  webSocket.on("error", () => {
    handlers.onClose(connection);
    webSocket.terminate();
  });

  return connection;
}
