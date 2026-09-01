import type { BrowserBeat } from "../../shared/browser-beat.ts";
import type { BeatBroadcaster } from "../../src/services/beat-broadcaster.ts";
import type { LessonServerMessage } from "../../shared/protocol.ts";

/** Records what the lesson would have sent to connected browsers. */
export class FakeBeatBroadcaster implements BeatBroadcaster {
  readonly sentMessages: LessonServerMessage[] = [];

  broadcast(message: LessonServerMessage): void {
    this.sentMessages.push(message);
  }

  get broadcastBeats(): BrowserBeat[] {
    const beats: BrowserBeat[] = [];
    for (const message of this.sentMessages) {
      if (message.type === "beat") {
        beats.push(message.beat);
      }
    }
    return beats;
  }
}
