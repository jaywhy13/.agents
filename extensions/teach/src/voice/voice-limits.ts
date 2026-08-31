/**
 * Every size, type, and time limit the voice path enforces, in one place.
 *
 * The lesson server is reachable by every other program on this machine, so an
 * upload it forwards to the Shopify AI Proxy has to be bounded before it is sent,
 * not after. Response bodies are bounded too: the proxy is trusted, but a bounded
 * reader means a runaway or wrong answer cannot fill this process's memory.
 */

/**
 * Containers a browser MediaRecorder actually produces, plus the two plain formats
 * a test or a script may send. Anything else is refused before the network is used.
 */
export const TRANSCRIBABLE_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/mpeg",
] as const;

export type TranscribableAudioMimeType = (typeof TRANSCRIBABLE_AUDIO_MIME_TYPES)[number];

/**
 * One learner answer, not a recording session. A minute of Opus is well under this;
 * the browser stops recording long before it, so reaching this means something is wrong.
 */
export const LARGEST_TRANSCRIPTION_UPLOAD_BYTES = 8 * 1024 * 1024;

/** A transcript is text. A body bigger than this is not a transcript. */
export const LARGEST_TRANSCRIPTION_RESPONSE_BYTES = 256 * 1024;

export const TRANSCRIPTION_TIMEOUT_MILLISECONDS = 30_000;

/**
 * One narrated beat, not a paragraph. Speech is request/response, so the whole
 * chunk has to be generated before a single word is heard: keeping the chunk short
 * is what keeps the wait short.
 */
export const LONGEST_SPEECH_CHARACTERS = 900;

/** About a minute of MP3 at the bitrate the speech endpoint returns. */
export const LARGEST_SPEECH_RESPONSE_BYTES = 4 * 1024 * 1024;

export const SPEECH_TIMEOUT_MILLISECONDS = 30_000;

/** How much of a failing proxy answer is kept for the error message. */
export const LONGEST_PROXY_ERROR_DETAIL_CHARACTERS = 500;

/** Cache bounds. A lesson is replayed often, so a hit is common and worth holding. */
export const LARGEST_CACHED_NARRATION_ENTRIES = 256;
export const LARGEST_CACHED_NARRATION_BYTES = 32 * 1024 * 1024;

/**
 * `audio/webm;codecs=opus` and `audio/webm` are the same container. The parameters
 * matter to the browser, not to the transcription endpoint, so they are dropped
 * before the type is checked.
 */
export function audioMimeTypeWithoutParameters(mimeType: string): string {
  const withoutParameters = mimeType.split(";")[0] ?? "";
  return withoutParameters.trim().toLowerCase();
}

export function isTranscribableAudioMimeType(mimeType: string): boolean {
  const bareMimeType = audioMimeTypeWithoutParameters(mimeType);
  return (TRANSCRIBABLE_AUDIO_MIME_TYPES as readonly string[]).includes(bareMimeType);
}

/** The file extension the proxy needs on the upload to pick the right decoder. */
export function fileExtensionForAudioMimeType(mimeType: string): string {
  switch (audioMimeTypeWithoutParameters(mimeType)) {
    case "audio/webm":
      return "webm";
    case "audio/ogg":
      return "ogg";
    case "audio/wav":
    case "audio/x-wav":
    case "audio/wave":
      return "wav";
    case "audio/mp4":
      return "mp4";
    case "audio/mpeg":
      return "mp3";
    default:
      return "bin";
  }
}

/**
 * Audio always sits in its own ArrayBuffer, never a SharedArrayBuffer. Saying so
 * lets the bytes go straight into a Blob or a Response body with no copy and no cast.
 */
export type AudioBytes = Uint8Array<ArrayBuffer>;
