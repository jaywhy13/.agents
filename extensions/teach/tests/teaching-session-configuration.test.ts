import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveTeachingSessionConfiguration } from "../src/services/teaching-session-configuration.ts";

type ConfigurationContext = Parameters<typeof resolveTeachingSessionConfiguration>[0];

function contextWithAuth(
  auth: Awaited<ReturnType<ConfigurationContext["modelRegistry"]["getApiKeyAndHeaders"]>>,
): ConfigurationContext {
  return {
    model: {
      id: "claude-opus-5",
      name: "Claude Opus",
      provider: "anthropic",
      api: "anthropic-messages",
      baseUrl: "https://proxy.shopify.ai/apis/anthropic",
      reasoning: true,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200_000,
      maxTokens: 32_000,
    },
    thinkingLevel: "high",
    modelRegistry: {
      getApiKeyAndHeaders: async () => auth,
    },
  } as unknown as ConfigurationContext;
}

describe("teaching session configuration", () => {
  it("copies the credential from Pi's active model runtime", async () => {
    const configuration = await resolveTeachingSessionConfiguration(
      contextWithAuth({
        ok: true,
        apiKey: "fresh-session-key",
        headers: { "x-shopify-test": "present" },
        baseUrl: "https://proxy.shopify.ai/apis/anthropic",
      }),
    );

    assert.equal(configuration.apiKey, "fresh-session-key");
    assert.equal(configuration.baseUrl, "https://proxy.shopify.ai/apis/anthropic");
    assert.deepEqual(configuration.headers, { "x-shopify-test": "present" });
    assert.equal(configuration.thinkingLevel, "high");
  });

  it("refuses to start without an active model", async () => {
    const context = contextWithAuth({ ok: true, apiKey: "unused" });
    const withoutModel = { ...context, model: undefined } as ConfigurationContext;

    await assert.rejects(
      resolveTeachingSessionConfiguration(withoutModel),
      /no active model/,
    );
  });

  it("reports a credential-resolution failure before opening the lesson", async () => {
    await assert.rejects(
      resolveTeachingSessionConfiguration(
        contextWithAuth({ ok: false, error: "credential expired" }),
      ),
      /credential expired/,
    );
  });

  it("refuses credentials that cannot be shared with the nested session", async () => {
    await assert.rejects(
      resolveTeachingSessionConfiguration(
        contextWithAuth({ ok: true, headers: { authorization: "Bearer token" } }),
      ),
      /does not expose a credential/,
    );
  });
});
