import { Buffer } from "node:buffer";

import type { Beat, NarrationBeat } from "../../shared/beat.ts";
import type {
  LessonVoicePort,
  NarrationAudioOutcome,
  TranscriptionOutcome,
  TranscriptionRequestFromPage,
} from "../server/lesson-media.ts";
import { SPOKEN_AUDIO_MIME_TYPE } from "./proxy-speech-client.ts";
import type { TeachVoice } from "./index.ts";
import {
  AudioSizeRejectedError,
  UnsupportedAudioFormatError,
} from "./voice-errors.ts";

/** Finds the narration beat an address names, without the server knowing storage. */
export interface NarrationBeatLookup {
  (beatId: string): Promise<{ readonly lessonId: string; readonly beat: NarrationBeat } | null>;
}

export interface LessonVoiceAdapterOptions {
  /** Null when this pi session has no Shopify AI Proxy credential. */
  readonly voice: TeachVoice | null;
  readonly findNarrationBeat: NarrationBeatLookup;
}

const NO_VOICE_REASON =
  "This lesson has no voice: there is no Shopify AI Proxy credential in this pi session. Start pi through `devx pi` to turn voice on.";

/**
 * Joins the voice module to the lesson server's two voice addresses.
 *
 * It exists so the server layer never learns that speech comes from a proxy, and so
 * the "no credential" case is one object with `isAvailable` false rather than a
 * branch in the routing. Every way voice can refuse becomes a named outcome, because
 * each one is a different status code and a different thing to tell the learner.
 *
 * Narration is spoken when the page asks for it, not when the beat is published. A
 * beat the learner never reaches costs nothing, a page that reloads gets the audio
 * back from the cache, and a slow proxy call never holds up a teaching turn.
 */
export class LessonVoiceAdapter implements LessonVoicePort {
  private readonly voice: TeachVoice | null;
  private readonly findNarrationBeat: NarrationBeatLookup;

  constructor(options: LessonVoiceAdapterOptions) {
    this.voice = options.voice;
    this.findNarrationBeat = options.findNarrationBeat;
  }

  get isAvailable(): boolean {
    return this.voice !== null;
  }

  async transcribe(request: TranscriptionRequestFromPage): Promise<TranscriptionOutcome> {
    const voice = this.voice;
    if (voice === null) {
      return { kind: "unavailable", reason: NO_VOICE_REASON };
    }

    try {
      const transcript = await voice.transcriptionClient.transcribe({
        audio: audioBytesOf(request.audio),
        mimeType: request.mimeType,
      });
      return { kind: "transcribed", text: transcript.text };
    } catch (cause) {
      // A recording the learner's own browser produced badly is the learner's
      // problem to see, not a lesson failure, so it is refused rather than failed.
      if (
        cause instanceof UnsupportedAudioFormatError ||
        cause instanceof AudioSizeRejectedError
      ) {
        return { kind: "refused", reason: cause.message };
      }
      return { kind: "failed", reason: describeCause(cause) };
    }
  }

  async narrationFor(beatId: string): Promise<NarrationAudioOutcome> {
    const voice = this.voice;
    if (voice === null) {
      return { kind: "unavailable", reason: NO_VOICE_REASON };
    }

    const found = await this.findNarrationBeat(beatId);
    if (found === null) {
      return { kind: "unknown_beat" };
    }

    try {
      const narrated = await voice.narrationVoiceService.narrateBeat({
        lessonId: found.lessonId,
        beatId: found.beat.beatId,
        chunks: found.beat.chunks,
      });
      return {
        kind: "ready",
        audio: {
          beatId: narrated.beatId,
          mimeType: SPOKEN_AUDIO_MIME_TYPE,
          lines: narrated.lines.map((line) => ({
            lineIndex: line.lineIndex,
            text: line.text,
            audioBase64: Buffer.from(line.audio).toString("base64"),
          })),
        },
      };
    } catch (cause) {
      // Never stand-in audio and never silence: the page is told, and shows the
      // words instead.
      return { kind: "failed", reason: describeCause(cause) };
    }
  }

  /** Drops a closed lesson's cached audio. Safe when there is no voice. */
  forgetLesson(lessonId: string): void {
    this.voice?.narrationVoiceService.forgetLesson(lessonId);
  }
}

/** True when this beat is the narration for another beat. */
export function isNarrationBeat(beat: Beat): beat is NarrationBeat {
  return beat.kind === "narration";
}

/**
 * The voice limits type says audio always sits in its own ArrayBuffer, which lets
 * the bytes go into a Blob with no copy. A body read off a socket may be a view into
 * a larger pooled buffer, so it is copied here exactly when it has to be.
 */
function audioBytesOf(audio: Uint8Array): Uint8Array<ArrayBuffer> {
  if (audio.byteOffset === 0 && audio.byteLength === audio.buffer.byteLength) {
    return audio as Uint8Array<ArrayBuffer>;
  }
  return new Uint8Array(audio.slice().buffer) as Uint8Array<ArrayBuffer>;
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
