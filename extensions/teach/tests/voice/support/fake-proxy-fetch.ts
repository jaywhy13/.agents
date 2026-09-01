import type { ProxyFetch, ProxyRequestInit } from "../../../src/voice/proxy-http.ts";
import type { ShopifyProxyConfiguration } from "../../../src/voice/shopify-proxy-configuration.ts";
import type { AudioBytes } from "../../../src/voice/voice-limits.ts";

/**
 * Stands in for the network. It records what was sent and returns real `Response`
 * objects, so the client under test reads a real body stream, real headers, and a
 * real status. No test ever reaches the Shopify AI Proxy.
 */
export class FakeProxyFetch {
  readonly calls: { url: string; init: ProxyRequestInit }[] = [];

  private readonly answers: ((init: ProxyRequestInit) => Promise<Response>)[] = [];

  readonly fetch: ProxyFetch = async (url, init) => {
    this.calls.push({ url, init });
    const nextAnswer = this.answers.shift();
    if (nextAnswer === undefined) {
      throw new Error(`No answer was queued for ${url}.`);
    }
    return nextAnswer(init);
  };

  answerWithJson(body: unknown, status = 200): this {
    return this.answerWith(
      () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
    );
  }

  answerWithAudio(audio: AudioBytes, contentType = "audio/mpeg", status = 200): this {
    return this.answerWith(() => new Response(audio, { status, headers: { "content-type": contentType } }));
  }

  answerWithText(text: string, status: number, contentType = "text/plain"): this {
    return this.answerWith(() => new Response(text, { status, headers: { "content-type": contentType } }));
  }

  /** Never answers, and rejects on abort the way a real fetch does. */
  answerWithNothing(): this {
    this.answers.push(
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );
    return this;
  }

  failWith(cause: Error): this {
    return this.answerWith(() => Promise.reject(cause));
  }

  answerWith(answer: () => Promise<Response> | Response): this {
    this.answers.push(async () => answer());
    return this;
  }

  get onlyCall(): { url: string; init: ProxyRequestInit } {
    const call = this.calls[0];
    if (call === undefined) {
      throw new Error("The proxy was never called.");
    }
    return call;
  }

  get callCount(): number {
    return this.calls.length;
  }
}

export function testProxyConfiguration(
  overrides: Partial<ShopifyProxyConfiguration> = {},
): ShopifyProxyConfiguration {
  return {
    baseUrl: "https://proxy.shopify.ai/vendors/openai/v1",
    authorizationHeaderValue: "Bearer test-credential",
    transcriptionModel: "gpt-4o-mini-transcribe",
    speechModel: "gpt-4o-mini-tts",
    speechVoice: "alloy",
    ...overrides,
  };
}

export function audioBytes(byteLength: number, fillValue = 7): AudioBytes {
  return new Uint8Array(byteLength).fill(fillValue);
}
