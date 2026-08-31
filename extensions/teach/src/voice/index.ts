/**
 * The voice path, assembled.
 *
 * One function builds every piece from the environment, so the code that wires
 * voice into the lesson host has one import and one decision: voice is on, or it
 * is off because there is no credential.
 */

import { NarrationAudioCache } from "./narration-audio-cache.ts";
import type { NarrationAudioCacheBounds } from "./narration-audio-cache.ts";
import { NarrationVoiceService } from "./narration-voice-service.ts";
import type { ProxyFetch } from "./proxy-http.ts";
import { ProxySpeechClient } from "./proxy-speech-client.ts";
import { ProxyTranscriptionClient } from "./proxy-transcription-client.ts";
import type { Environment, ShopifyProxyConfiguration } from "./shopify-proxy-configuration.ts";
import { readShopifyProxyConfigurationIfAvailable } from "./shopify-proxy-configuration.ts";

export * from "./narration-audio-cache.ts";
export * from "./narration-speech-text.ts";
export * from "./narration-voice-service.ts";
export * from "./proxy-http.ts";
export * from "./proxy-speech-client.ts";
export * from "./proxy-transcription-client.ts";
export * from "./shopify-proxy-configuration.ts";
export * from "./voice-errors.ts";
export * from "./voice-limits.ts";

export interface TeachVoice {
  readonly configuration: ShopifyProxyConfiguration;
  readonly transcriptionClient: ProxyTranscriptionClient;
  readonly speechClient: ProxySpeechClient;
  readonly narrationVoiceService: NarrationVoiceService;
  readonly audioCache: NarrationAudioCache;
}

export interface TeachVoiceOptions {
  readonly cacheBounds?: NarrationAudioCacheBounds;
}

/**
 * Returns null when there is no Shopify AI Proxy credential in the environment.
 * A lesson without voice still teaches, so a missing credential switches voice off
 * rather than stopping `/teach`.
 */
export function createTeachVoice(
  environment: Environment,
  fetchFromProxy: ProxyFetch,
  options: TeachVoiceOptions = {},
): TeachVoice | null {
  const configuration = readShopifyProxyConfigurationIfAvailable(environment);
  if (configuration === null) {
    return null;
  }

  const speechClient = new ProxySpeechClient(configuration, fetchFromProxy);
  const audioCache = new NarrationAudioCache(options.cacheBounds);

  return {
    configuration,
    transcriptionClient: new ProxyTranscriptionClient(configuration, fetchFromProxy),
    speechClient,
    audioCache,
    narrationVoiceService: new NarrationVoiceService(speechClient, audioCache),
  };
}
