/**
 * Every way the voice path can refuse to do its job, named.
 *
 * The lesson must never guess when speech or transcription fails. A named error
 * lets the caller say what went wrong on the lesson page instead of playing
 * silence or sending an empty answer to the teaching agent.
 */

/** The environment does not hold a usable Shopify AI Proxy credential or setting. */
export class VoiceConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceConfigurationError";
  }
}

/** The browser sent audio in a container the transcription endpoint does not take. */
export class UnsupportedAudioFormatError extends Error {
  readonly mimeType: string;
  readonly supportedMimeTypes: readonly string[];

  constructor(mimeType: string, supportedMimeTypes: readonly string[]) {
    super(
      `Audio type ${mimeType} cannot be transcribed. Supported types: ${supportedMimeTypes.join(", ")}.`,
    );
    this.name = "UnsupportedAudioFormatError";
    this.mimeType = mimeType;
    this.supportedMimeTypes = supportedMimeTypes;
  }
}

/** The recording is empty, or larger than the upload limit. */
export class AudioSizeRejectedError extends Error {
  readonly byteLength: number;
  readonly largestAllowedBytes: number;

  constructor(message: string, byteLength: number, largestAllowedBytes: number) {
    super(message);
    this.name = "AudioSizeRejectedError";
    this.byteLength = byteLength;
    this.largestAllowedBytes = largestAllowedBytes;
  }
}

/** The text handed to the speech endpoint is blank or longer than one teaching chunk. */
export class SpeechTextRejectedError extends Error {
  readonly characterCount: number;
  readonly longestAllowedCharacters: number;

  constructor(message: string, characterCount: number, longestAllowedCharacters: number) {
    super(message);
    this.name = "SpeechTextRejectedError";
    this.characterCount = characterCount;
    this.longestAllowedCharacters = longestAllowedCharacters;
  }
}

/** The proxy answered with a status outside 200-299. */
export class ProxyRequestFailedError extends Error {
  readonly status: number;
  readonly proxyPath: string;
  /** A short, truncated excerpt of the proxy's own message. Never holds the credential. */
  readonly detail: string;

  constructor(proxyPath: string, status: number, detail: string) {
    super(`Shopify AI Proxy ${proxyPath} answered ${status}: ${detail}`);
    this.name = "ProxyRequestFailedError";
    this.status = status;
    this.proxyPath = proxyPath;
    this.detail = detail;
  }
}

/** The proxy did not answer inside the request deadline. */
export class ProxyTimedOutError extends Error {
  readonly proxyPath: string;
  readonly timeoutMilliseconds: number;

  constructor(proxyPath: string, timeoutMilliseconds: number) {
    super(
      `Shopify AI Proxy ${proxyPath} did not answer within ${timeoutMilliseconds} milliseconds.`,
    );
    this.name = "ProxyTimedOutError";
    this.proxyPath = proxyPath;
    this.timeoutMilliseconds = timeoutMilliseconds;
  }
}

/** The proxy started sending a body larger than the reader is allowed to hold. */
export class ProxyResponseTooLargeError extends Error {
  readonly proxyPath: string;
  readonly largestAllowedBytes: number;

  constructor(proxyPath: string, largestAllowedBytes: number) {
    super(
      `Shopify AI Proxy ${proxyPath} sent more than ${largestAllowedBytes} bytes, so the answer was dropped.`,
    );
    this.name = "ProxyResponseTooLargeError";
    this.proxyPath = proxyPath;
    this.largestAllowedBytes = largestAllowedBytes;
  }
}

/** The proxy answered with a body that is not the shape this client can read. */
export class ProxyResponseUnreadableError extends Error {
  readonly proxyPath: string;

  constructor(proxyPath: string, reason: string) {
    super(`Shopify AI Proxy ${proxyPath} sent an answer this client cannot read: ${reason}`);
    this.name = "ProxyResponseUnreadableError";
    this.proxyPath = proxyPath;
  }
}

/**
 * No audio exists for this beat and none could be made. Thrown instead of handing
 * back empty or stand-in audio, so a failed narration is always visible.
 */
export class NarrationAudioUnavailableError extends Error {
  readonly lessonId: string;
  readonly beatId: string;

  constructor(lessonId: string, beatId: string, options: { cause: unknown }) {
    super(`Narration audio for beat ${beatId} in lesson ${lessonId} could not be produced.`, {
      cause: options.cause,
    });
    this.name = "NarrationAudioUnavailableError";
    this.lessonId = lessonId;
    this.beatId = beatId;
  }
}
