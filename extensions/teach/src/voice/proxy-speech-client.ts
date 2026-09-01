/**
 * Turns one short teaching line into spoken MP3, through the Shopify AI Proxy's
 * OpenAI-compatible `/audio/speech` route.
 *
 * The route is request/response: nothing is heard until the whole line is
 * generated. That is why the client refuses text longer than one teaching chunk —
 * the length of the chunk is the length of the wait, so the limit is the latency
 * budget written down.
 *
 * MP3 is asked for because every browser plays it from a plain `Audio` element,
 * with no decoder, no worklet, and no extra dependency on the lesson page.
 */

import type { ProxyFetch } from "./proxy-http.ts";
import { sendProxyRequest } from "./proxy-http.ts";
import type {
  ShopifyProxyConfiguration,
  SpeechModel,
  SpeechVoice,
} from "./shopify-proxy-configuration.ts";
import { proxyUrl, SPEECH_PATH } from "./shopify-proxy-configuration.ts";
import { ProxyResponseUnreadableError, SpeechTextRejectedError } from "./voice-errors.ts";
import type { AudioBytes } from "./voice-limits.ts";
import {
  LARGEST_SPEECH_RESPONSE_BYTES,
  LONGEST_SPEECH_CHARACTERS,
  SPEECH_TIMEOUT_MILLISECONDS,
} from "./voice-limits.ts";

export const SPOKEN_AUDIO_MIME_TYPE = "audio/mpeg";

export interface SpeechRequest {
  readonly text: string;
  /** Overrides the configured voice for one line, for example a quoted term. */
  readonly voice?: SpeechVoice;
  readonly model?: SpeechModel;
  /** A short style note the `gpt-4o-mini-tts` model accepts, such as "calm, teaching". */
  readonly speakingStyle?: string;
}

export interface SpokenAudio {
  readonly audio: AudioBytes;
  readonly mimeType: typeof SPOKEN_AUDIO_MIME_TYPE;
  readonly model: SpeechModel;
  readonly voice: SpeechVoice;
}

export interface SpeechClientLimits {
  readonly longestTextCharacters: number;
  readonly largestResponseBytes: number;
  readonly timeoutMilliseconds: number;
}

export const DEFAULT_SPEECH_LIMITS: SpeechClientLimits = {
  longestTextCharacters: LONGEST_SPEECH_CHARACTERS,
  largestResponseBytes: LARGEST_SPEECH_RESPONSE_BYTES,
  timeoutMilliseconds: SPEECH_TIMEOUT_MILLISECONDS,
};

export class ProxySpeechClient {
  private readonly configuration: ShopifyProxyConfiguration;
  private readonly fetchFromProxy: ProxyFetch;
  private readonly limits: SpeechClientLimits;

  constructor(
    configuration: ShopifyProxyConfiguration,
    fetchFromProxy: ProxyFetch,
    limits: SpeechClientLimits = DEFAULT_SPEECH_LIMITS,
  ) {
    this.configuration = configuration;
    this.fetchFromProxy = fetchFromProxy;
    this.limits = limits;
  }

  get longestTextCharacters(): number {
    return this.limits.longestTextCharacters;
  }

  /** What `speak` uses when a request names no model of its own. */
  get defaultSpeechModel(): SpeechModel {
    return this.configuration.speechModel;
  }

  get defaultSpeechVoice(): SpeechVoice {
    return this.configuration.speechVoice;
  }

  async speak(request: SpeechRequest): Promise<SpokenAudio> {
    const text = this.requireSpeakableText(request.text);
    const model = request.model ?? this.configuration.speechModel;
    const voice = request.voice ?? this.configuration.speechVoice;

    const answer = await sendProxyRequest(this.fetchFromProxy, {
      url: proxyUrl(this.configuration, SPEECH_PATH),
      proxyPath: SPEECH_PATH,
      authorizationHeaderValue: this.configuration.authorizationHeaderValue,
      contentType: "application/json",
      body: JSON.stringify(speechBody(text, model, voice, request.speakingStyle)),
      timeoutMilliseconds: this.limits.timeoutMilliseconds,
      largestResponseBytes: this.limits.largestResponseBytes,
    });

    refuseAnythingButAudio(answer.contentType, answer.bytes);

    return { audio: answer.bytes, mimeType: SPOKEN_AUDIO_MIME_TYPE, model, voice };
  }

  private requireSpeakableText(rawText: string): string {
    const text = rawText.trim();
    if (text === "") {
      throw new SpeechTextRejectedError(
        "There is nothing to speak: the text is blank.",
        0,
        this.limits.longestTextCharacters,
      );
    }
    if (text.length > this.limits.longestTextCharacters) {
      throw new SpeechTextRejectedError(
        `Speech text is ${text.length} characters, over the ${this.limits.longestTextCharacters} character limit for one narrated beat. Split it into shorter beats.`,
        text.length,
        this.limits.longestTextCharacters,
      );
    }
    return text;
  }
}

function speechBody(
  text: string,
  model: SpeechModel,
  voice: SpeechVoice,
  speakingStyle: string | undefined,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    voice,
    input: text,
    response_format: "mp3",
  };
  // Only the `gpt-4o-mini-tts` model reads a style note; the older models reject it.
  if (speakingStyle !== undefined && model === "gpt-4o-mini-tts") {
    body["instructions"] = speakingStyle;
  }
  return body;
}

/**
 * A JSON error body with a 200 status would otherwise be played as audio and heard
 * as noise. Audio that is empty is a failure too, and is never handed back as if
 * it were speech.
 */
function refuseAnythingButAudio(contentType: string, bytes: AudioBytes): void {
  if (bytes.byteLength === 0) {
    throw new ProxyResponseUnreadableError(SPEECH_PATH, "the audio body is empty.");
  }
  if (contentType !== "" && !contentType.toLowerCase().startsWith("audio/")) {
    throw new ProxyResponseUnreadableError(
      SPEECH_PATH,
      `the body is ${contentType}, not audio.`,
    );
  }
}
