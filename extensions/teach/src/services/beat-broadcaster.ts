import type { LessonServerMessage } from "../../shared/protocol.ts";

/**
 * Sends lesson messages to every browser watching this lesson. The WebSocket
 * implementation lives in the server layer; the teaching services only need this
 * one method.
 */
export interface BeatBroadcaster {
  broadcast(message: LessonServerMessage): void;
}
