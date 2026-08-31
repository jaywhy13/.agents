import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasProxyCredential,
  readShopifyProxyConfiguration,
  readShopifyProxyConfigurationIfAvailable,
  SHOPIFY_PROXY_OPENAI_BASE_URL,
} from "../../src/voice/shopify-proxy-configuration.ts";
import { VoiceConfigurationError } from "../../src/voice/voice-errors.ts";

function environmentWith(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return { PI_PROXY_API_KEY: "test-key", ...overrides };
}

describe("the proxy credential", () => {
  it("wraps a bare api key in a Bearer header", () => {
    const configuration = readShopifyProxyConfiguration(environmentWith());

    assert.equal(configuration.authorizationHeaderValue, "Bearer test-key");
  });

  it("prefers the ready-made authorization header pi already exports", () => {
    const environmentWithBothCredentials = environmentWith({
      PI_PROXY_AUTH_HEADER: "Bearer shopify-token",
    });

    const configuration = readShopifyProxyConfiguration(environmentWithBothCredentials);

    assert.equal(configuration.authorizationHeaderValue, "Bearer shopify-token");
  });

  it("says which variable to set when there is no credential", () => {
    const environmentWithoutCredential = { PATH: "/usr/bin" };

    assert.throws(() => readShopifyProxyConfiguration(environmentWithoutCredential), {
      name: "VoiceConfigurationError",
      message: /PI_PROXY_API_KEY/,
    });
  });

  it("treats a blank api key as no credential at all", () => {
    const environmentWithBlankKey = environmentWith({ PI_PROXY_API_KEY: "   " });

    assert.equal(hasProxyCredential(environmentWithBlankKey), false);
  });
});

describe("switching voice off", () => {
  it("returns nothing rather than throwing when no credential is set", () => {
    const environmentWithoutCredential = { PATH: "/usr/bin" };

    assert.equal(readShopifyProxyConfigurationIfAvailable(environmentWithoutCredential), null);
  });

  it("still reports a bad setting when a credential is present", () => {
    const environmentWithBadVoice = environmentWith({ TEACH_VOICE_SPEECH_VOICE: "gravel" });

    assert.throws(
      () => readShopifyProxyConfigurationIfAvailable(environmentWithBadVoice),
      VoiceConfigurationError,
    );
  });
});

describe("the address the voice path calls", () => {
  it("defaults to the proxy's OpenAI vendor route", () => {
    const configuration = readShopifyProxyConfiguration(environmentWith());

    assert.equal(configuration.baseUrl, SHOPIFY_PROXY_OPENAI_BASE_URL);
  });

  it("drops a trailing slash from an override so paths never double up", () => {
    const environmentWithSlash = environmentWith({
      TEACH_VOICE_PROXY_BASE_URL: "https://proxy.shopify.ai/vendors/openai/v1/",
    });

    const configuration = readShopifyProxyConfiguration(environmentWithSlash);

    assert.equal(configuration.baseUrl, "https://proxy.shopify.ai/vendors/openai/v1");
  });

  it("refuses a plain http override so the credential is never sent in the clear", () => {
    const environmentWithHttp = environmentWith({
      TEACH_VOICE_PROXY_BASE_URL: "http://proxy.shopify.ai/vendors/openai/v1",
    });

    assert.throws(() => readShopifyProxyConfiguration(environmentWithHttp), {
      name: "VoiceConfigurationError",
      message: /https/,
    });
  });
});

describe("the speech model and voice", () => {
  it("uses the short teaching defaults when nothing is configured", () => {
    const configuration = readShopifyProxyConfiguration(environmentWith());

    assert.equal(configuration.speechModel, "gpt-4o-mini-tts");
    assert.equal(configuration.speechVoice, "alloy");
  });

  it("takes a supported model from the environment", () => {
    const environmentWithModel = environmentWith({ TEACH_VOICE_SPEECH_MODEL: "tts-1-hd" });

    assert.equal(readShopifyProxyConfiguration(environmentWithModel).speechModel, "tts-1-hd");
  });

  it("refuses a model the speech route does not accept", () => {
    const environmentWithBadModel = environmentWith({ TEACH_VOICE_SPEECH_MODEL: "gpt-4o" });

    assert.throws(() => readShopifyProxyConfiguration(environmentWithBadModel), {
      name: "VoiceConfigurationError",
      message: /gpt-4o-mini-tts/,
    });
  });

  it("always asks for the transcription model the lesson was built against", () => {
    const configuration = readShopifyProxyConfiguration(environmentWith());

    assert.equal(configuration.transcriptionModel, "gpt-4o-mini-transcribe");
  });
});
