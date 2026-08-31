/**
 * Where the voice path talks, and with what credential.
 *
 * Only the pi process holds the credential. It is read from the environment here,
 * kept in one value object, and never sent to the lesson page: the page asks the
 * lesson server for audio and for transcripts, and the lesson server is the only
 * thing that ever calls the Shopify AI Proxy.
 *
 * The Shopify AI Proxy is an OpenAI-compatible HTTP surface Shopify runs in front
 * of several model vendors. `/vendors/openai/v1` is its pass-through route to
 * OpenAI, so the request and response shapes are OpenAI's own.
 */

import type { Environment } from "../proxy/shopify-proxy-credential.ts";
import {
  API_KEY_VARIABLE,
  AUTHORIZATION_HEADER_VARIABLE,
  hasProxyCredential,
  readProxyCredential,
} from "../proxy/shopify-proxy-credential.ts";
import { VoiceConfigurationError } from "./voice-errors.ts";

export const SHOPIFY_PROXY_OPENAI_BASE_URL = "https://proxy.shopify.ai/vendors/openai/v1";

export const TRANSCRIPTIONS_PATH = "/audio/transcriptions";
export const SPEECH_PATH = "/audio/speech";

export const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

/** Speech models the OpenAI `/audio/speech` surface accepts. */
export const SUPPORTED_SPEECH_MODELS = ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"] as const;

export type SpeechModel = (typeof SUPPORTED_SPEECH_MODELS)[number];

export const SUPPORTED_SPEECH_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
] as const;

export type SpeechVoice = (typeof SUPPORTED_SPEECH_VOICES)[number];

export const DEFAULT_SPEECH_MODEL: SpeechModel = "gpt-4o-mini-tts";
export const DEFAULT_SPEECH_VOICE: SpeechVoice = "alloy";

// Re-exported because the voice path is where a caller already looks for them, and
// because both halves of the lesson must read the same two variables.
export type { Environment };
export { API_KEY_VARIABLE, AUTHORIZATION_HEADER_VARIABLE, hasProxyCredential };

export const BASE_URL_VARIABLE = "TEACH_VOICE_PROXY_BASE_URL";
export const SPEECH_MODEL_VARIABLE = "TEACH_VOICE_SPEECH_MODEL";
export const SPEECH_VOICE_VARIABLE = "TEACH_VOICE_SPEECH_VOICE";

export interface ShopifyProxyConfiguration {
  readonly baseUrl: string;
  /** The whole `Authorization` header value, including the `Bearer ` prefix. */
  readonly authorizationHeaderValue: string;
  readonly transcriptionModel: string;
  readonly speechModel: SpeechModel;
  readonly speechVoice: SpeechVoice;
}

/**
 * Reads the voice settings, or explains exactly which one is missing or wrong. The
 * credential itself is read by `shopify-proxy-credential.ts`, which pictures read
 * too, so voice and pictures are never on for different environments.
 */
export function readShopifyProxyConfiguration(environment: Environment): ShopifyProxyConfiguration {
  return {
    baseUrl: readBaseUrl(environment),
    authorizationHeaderValue: readAuthorizationHeaderValue(environment),
    transcriptionModel: TRANSCRIPTION_MODEL,
    speechModel: readSpeechModel(environment),
    speechVoice: readSpeechVoice(environment),
  };
}

/**
 * The same read, but silent when there is no credential at all. Lets the lesson
 * start with voice switched off rather than refusing to start.
 */
export function readShopifyProxyConfigurationIfAvailable(
  environment: Environment,
): ShopifyProxyConfiguration | null {
  if (!hasProxyCredential(environment)) {
    return null;
  }
  return readShopifyProxyConfiguration(environment);
}

export function proxyUrl(configuration: ShopifyProxyConfiguration, proxyPath: string): string {
  return `${configuration.baseUrl}${proxyPath}`;
}

function readAuthorizationHeaderValue(environment: Environment): string {
  const credential = readProxyCredential(environment);
  if (credential === null) {
    throw new VoiceConfigurationError(
      `Voice needs a Shopify AI Proxy credential. Set ${AUTHORIZATION_HEADER_VARIABLE} or ${API_KEY_VARIABLE} in the environment pi runs in.`,
    );
  }
  return credential;
}

function readBaseUrl(environment: Environment): string {
  const configuredBaseUrl = nonBlankOrNull(environment[BASE_URL_VARIABLE]);
  if (configuredBaseUrl === null) {
    return SHOPIFY_PROXY_OPENAI_BASE_URL;
  }

  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(configuredBaseUrl);
  } catch {
    throw new VoiceConfigurationError(
      `${BASE_URL_VARIABLE} is not a URL: ${configuredBaseUrl}`,
    );
  }
  if (parsedBaseUrl.protocol !== "https:") {
    throw new VoiceConfigurationError(
      `${BASE_URL_VARIABLE} must be an https address so the credential is never sent in the clear. Got ${configuredBaseUrl}`,
    );
  }

  return configuredBaseUrl.replace(/\/+$/, "");
}

function readSpeechModel(environment: Environment): SpeechModel {
  const configuredModel = nonBlankOrNull(environment[SPEECH_MODEL_VARIABLE]);
  if (configuredModel === null) {
    return DEFAULT_SPEECH_MODEL;
  }
  if (!isSupportedSpeechModel(configuredModel)) {
    throw new VoiceConfigurationError(
      `${SPEECH_MODEL_VARIABLE} must be one of ${SUPPORTED_SPEECH_MODELS.join(", ")}. Got ${configuredModel}`,
    );
  }
  return configuredModel;
}

function readSpeechVoice(environment: Environment): SpeechVoice {
  const configuredVoice = nonBlankOrNull(environment[SPEECH_VOICE_VARIABLE]);
  if (configuredVoice === null) {
    return DEFAULT_SPEECH_VOICE;
  }
  if (!isSupportedSpeechVoice(configuredVoice)) {
    throw new VoiceConfigurationError(
      `${SPEECH_VOICE_VARIABLE} must be one of ${SUPPORTED_SPEECH_VOICES.join(", ")}. Got ${configuredVoice}`,
    );
  }
  return configuredVoice;
}

export function isSupportedSpeechModel(candidate: string): candidate is SpeechModel {
  return (SUPPORTED_SPEECH_MODELS as readonly string[]).includes(candidate);
}

export function isSupportedSpeechVoice(candidate: string): candidate is SpeechVoice {
  return (SUPPORTED_SPEECH_VOICES as readonly string[]).includes(candidate);
}

function nonBlankOrNull(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
