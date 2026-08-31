/**
 * What the lesson server needs from voice and from pictures, named by the server
 * rather than taken from the modules that provide them.
 *
 * The server layer knows about addresses, bodies, and limits. It does not know that
 * speech comes from the Shopify AI Proxy or that an image is a file under the
 * lesson directory. Keeping the seam here means the routes can be tested with a
 * fake that never calls anything, and that a lesson with no proxy credential is one
 * `null` rather than a special case in the routing.
 *
 * Every outcome is a named case rather than an exception, because each one maps to a
 * different status code and a different thing to tell the learner.
 */

/** One short line of a narrated beat, as the page will play it. */
export interface NarrationAudioLine {
  readonly lineIndex: number;
  /** The words, so the page can show a transcript beside the audio. */
  readonly text: string;
  /** The MP3 for this line, base64 encoded so it travels in the JSON reply. */
  readonly audioBase64: string;
}

export interface NarrationAudio {
  readonly beatId: string;
  readonly mimeType: string;
  readonly lines: readonly NarrationAudioLine[];
}

export type NarrationAudioOutcome =
  | { readonly kind: "ready"; readonly audio: NarrationAudio }
  /** No credential, so this lesson has no voice at all. */
  | { readonly kind: "unavailable"; readonly reason: string }
  | { readonly kind: "unknown_beat" }
  /** Voice is on, but this beat could not be spoken. The page shows the words. */
  | { readonly kind: "failed"; readonly reason: string };

export type TranscriptionOutcome =
  | { readonly kind: "transcribed"; readonly text: string }
  | { readonly kind: "unavailable"; readonly reason: string }
  /** The recording itself was refused: wrong format, empty, or too big. */
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "failed"; readonly reason: string };

export interface TranscriptionRequestFromPage {
  readonly audio: Uint8Array;
  /** Exactly what the browser's MediaRecorder reported, parameters and all. */
  readonly mimeType: string;
}

export interface LessonVoicePort {
  /** False when there is no proxy credential. The lesson still teaches. */
  readonly isAvailable: boolean;
  transcribe(request: TranscriptionRequestFromPage): Promise<TranscriptionOutcome>;
  narrationFor(beatId: string): Promise<NarrationAudioOutcome>;
}

export interface LessonImagePort {
  /** Null when this lesson has no picture under that id yet. */
  readBytes(illustrationId: string): Promise<Uint8Array | null>;
}
