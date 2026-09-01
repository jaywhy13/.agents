import { beatForBrowser, beatsForBrowser } from "../../shared/browser-beat.ts";
import type { LessonServerMessage } from "../../shared/protocol.ts";
import type { BeatBroadcaster } from "../services/beat-broadcaster.ts";

/** One browser watching the lesson. */
export interface LessonConnection {
  send(text: string): void;
  close(): void;
}

/**
 * Holds the open browser connections and fans lesson messages out to all of them.
 * It sits between the teaching services, which only know `broadcast`, and the
 * WebSocket code, which only knows sockets.
 */
export class ConnectionHub implements BeatBroadcaster {
  private readonly connections = new Set<LessonConnection>();

  add(connection: LessonConnection): void {
    this.connections.add(connection);
  }

  remove(connection: LessonConnection): void {
    this.connections.delete(connection);
  }

  get connectionCount(): number {
    return this.connections.size;
  }

  broadcast(message: LessonServerMessage): void {
    const text = JSON.stringify(redactedForBrowser(message));
    for (const connection of this.connections) {
      // One unusable socket must not stop the other browsers from getting the beat.
      try {
        connection.send(text);
      } catch {
        this.connections.delete(connection);
      }
    }
  }


  closeAll(): void {
    for (const connection of this.connections) {
      try {
        connection.close();
      } catch {
        // The socket is already gone; nothing left to close.
      }
    }
    this.connections.clear();
  }
}

/**
 * Drops a quiz beat's answer key on the way out.
 *
 * Every teaching service sends through this hub, and the hub is the only thing that
 * writes to a browser socket, so this is the one place that has to be right. A
 * caller that hands over a full `Beat` is still typed correctly, because a `Beat` is
 * assignable to a `BrowserBeat`; that is exactly why the redaction happens here
 * rather than being left to each caller to remember.
 *
 * One explicit branch per message type, so a new message carrying a beat cannot be
 * added without deciding what the browser may see of it.
 */
function redactedForBrowser(message: LessonServerMessage): LessonServerMessage {
  switch (message.type) {
    case "beat":
      return { type: "beat", beat: beatForBrowser(message.beat) };
    case "lesson_state":
      return { ...message, beats: beatsForBrowser(message.beats) };
    case "question":
    case "status":
    case "suggested_topic":
    case "quiz_result":
    case "illustration":
    case "notice":
      return message;
  }
}
