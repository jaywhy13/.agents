/**
 * Turns a recording made in the learner's browser into text, through the Shopify
 * AI Proxy's OpenAI-compatible `/audio/transcriptions` route.
 *
 * The browser records WebM/Opus on Chrome and Firefox, MP4/AAC on Safari, and a
 * script or a test may send WAV. All four are containers the endpoint decodes, so
 * the client forwards the bytes as they were recorded instead of transcoding.
 *
 * A multipart upload has to carry a file name with the right extension: the
 * endpoint picks its decoder from it, and rejects the upload without one.
 */

import type { ProxyFetch } from "./proxy-http.ts";
import { sendProxyRequest } from "./proxy-http.ts";
import type { ShopifyProxyConfiguration } from "./shopify-proxy-configuration.ts";
import { proxyUrl, TRANSCRIPTIONS_PATH } from "./shopify-proxy-configuration.ts";
import {
  AudioSizeRejectedError,
  ProxyResponseUnreadableError,
  UnsupportedAudioFormatError,
} from "./voice-errors.ts";
import type { AudioBytes } from "./voice-limits.ts";
import {
  audioMimeTypeWithoutParameters,
  fileExtensionForAudioMimeType,
  isTranscribableAudioMimeType,
  LARGEST_TRANSCRIPTION_RESPONSE_BYTES,
  LARGEST_TRANSCRIPTION_UPLOAD_BYTES,
  TRANSCRIBABLE_AUDIO_MIME_TYPES,
  TRANSCRIPTION_TIMEOUT_MILLISECONDS,
} from "./voice-limits.ts";

export interface TranscriptionRequest {
  readonly audio: AudioBytes;
  /** Exactly what the browser's MediaRecorder reported, parameters and all. */
  readonly mimeType: string;
  /** An ISO 639-1 code. Skipped when the learner's language is not known. */
  readonly languageHint?: string;
}

export interface Transcript {
  readonly text: string;
}

export interface TranscriptionClientLimits {
  readonly largestUploadBytes: number;
  readonly largestResponseBytes: number;
  readonly timeoutMilliseconds: number;
}

export const DEFAULT_TRANSCRIPTION_LIMITS: TranscriptionClientLimits = {
  largestUploadBytes: LARGEST_TRANSCRIPTION_UPLOAD_BYTES,
  largestResponseBytes: LARGEST_TRANSCRIPTION_RESPONSE_BYTES,
  timeoutMilliseconds: TRANSCRIPTION_TIMEOUT_MILLISECONDS,
};

export class ProxyTranscriptionClient {
  private readonly configuration: ShopifyProxyConfiguration;
  private readonly fetchFromProxy: ProxyFetch;
  private readonly limits: TranscriptionClientLimits;

  constructor(
    configuration: ShopifyProxyConfiguration,
    fetchFromProxy: ProxyFetch,
    limits: TranscriptionClientLimits = DEFAULT_TRANSCRIPTION_LIMITS,
  ) {
    this.configuration = configuration;
    this.fetchFromProxy = fetchFromProxy;
    this.limits = limits;
  }

  async transcribe(request: TranscriptionRequest): Promise<Transcript> {
    this.refuseUnusableAudio(request);

    const answer = await sendProxyRequest(this.fetchFromProxy, {
      url: proxyUrl(this.configuration, TRANSCRIPTIONS_PATH),
      proxyPath: TRANSCRIPTIONS_PATH,
      authorizationHeaderValue: this.configuration.authorizationHeaderValue,
      body: this.uploadFor(request),
      timeoutMilliseconds: this.limits.timeoutMilliseconds,
      largestResponseBytes: this.limits.largestResponseBytes,
    });

    return { text: readTranscriptText(answer.bytes) };
  }

  private refuseUnusableAudio(request: TranscriptionRequest): void {
    if (!isTranscribableAudioMimeType(request.mimeType)) {
      throw new UnsupportedAudioFormatError(request.mimeType, TRANSCRIBABLE_AUDIO_MIME_TYPES);
    }
    if (request.audio.byteLength === 0) {
      throw new AudioSizeRejectedError(
        "There is nothing to transcribe: the recording is empty.",
        0,
        this.limits.largestUploadBytes,
      );
    }
    if (request.audio.byteLength > this.limits.largestUploadBytes) {
      throw new AudioSizeRejectedError(
        `The recording is ${request.audio.byteLength} bytes, over the ${this.limits.largestUploadBytes} byte upload limit.`,
        request.audio.byteLength,
        this.limits.largestUploadBytes,
      );
    }
  }

  private uploadFor(request: TranscriptionRequest): FormData {
    const bareMimeType = audioMimeTypeWithoutParameters(request.mimeType);
    const fileName = `learner-answer.${fileExtensionForAudioMimeType(bareMimeType)}`;

    const upload = new FormData();
    upload.append("file", new Blob([request.audio], { type: bareMimeType }), fileName);
    upload.append("model", this.configuration.transcriptionModel);
    upload.append("response_format", "json");
    if (request.languageHint !== undefined) {
      upload.append("language", request.languageHint);
    }
    return upload;
  }
}

function readTranscriptText(bytes: AudioBytes): string {
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(new TextDecoder().decode(bytes));
  } catch (cause) {
    throw new ProxyResponseUnreadableError(
      TRANSCRIPTIONS_PATH,
      `the body is not JSON (${describeCause(cause)}).`,
    );
  }

  if (typeof parsedBody !== "object" || parsedBody === null) {
    throw new ProxyResponseUnreadableError(TRANSCRIPTIONS_PATH, "the body is not a JSON object.");
  }

  const text = (parsedBody as Record<string, unknown>)["text"];
  if (typeof text !== "string") {
    throw new ProxyResponseUnreadableError(TRANSCRIPTIONS_PATH, "the body has no text field.");
  }

  return text.trim();
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
