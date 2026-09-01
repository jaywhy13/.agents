import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { describe, it } from "node:test";

import type { ImageGenerationRequest } from "../../src/visuals/shopify-ai-proxy-image-client.ts";
import {
  ImageGenerationError,
  LARGEST_IMAGE_BYTES,
  LONGEST_PROMPT_CHARACTERS,
  PROXY_IMAGE_GENERATION_URL,
  ShopifyAiProxyImageClient,
} from "../../src/visuals/shopify-ai-proxy-image-client.ts";
import {
  FakeImageGenerationProxy,
  SMALLEST_VALID_PNG_BYTES,
} from "./support/fake-image-generation-proxy.ts";

function imageRequest(overrides: Partial<ImageGenerationRequest> = {}): ImageGenerationRequest {
  return {
    prompt: "A message queue between a producer and a consumer",
    size: "1024x1024",
    style: "diagram_sketch",
    ...overrides,
  };
}

function clientFor(proxy: FakeImageGenerationProxy): ShopifyAiProxyImageClient {
  return new ShopifyAiProxyImageClient({
    fetchImplementation: proxy.fetch,
    authorizationHeaderValue: "Bearer shopify-test-key",
  });
}

describe("asking the Shopify AI proxy for an image", () => {
  it("returns the image bytes the proxy sent", async () => {
    const proxy = new FakeImageGenerationProxy();
    proxy.answerWithImage(SMALLEST_VALID_PNG_BYTES);

    const image = await clientFor(proxy).generateImage(imageRequest());

    assert.deepEqual(image.bytes, SMALLEST_VALID_PNG_BYTES);
  });

  it("sends the request to the proxy and nowhere else", async () => {
    const proxy = new FakeImageGenerationProxy();

    await clientFor(proxy).generateImage(imageRequest());

    assert.equal(proxy.onlyRequest.url, PROXY_IMAGE_GENERATION_URL);
  });

  it("carries the proxy key as a bearer token", async () => {
    const proxy = new FakeImageGenerationProxy();

    await clientFor(proxy).generateImage(imageRequest());

    assert.equal(proxy.onlyRequest.authorization, "Bearer shopify-test-key");
  });

  it("sends the size the lesson asked for", async () => {
    const proxy = new FakeImageGenerationProxy();

    await clientFor(proxy).generateImage(imageRequest({ size: "1536x1024" }));

    assert.equal(proxy.onlyRequest.body["size"], "1536x1024");
  });

  it("adds the style wording to the prompt, so the style is never free text", async () => {
    const proxy = new FakeImageGenerationProxy();

    await clientFor(proxy).generateImage(imageRequest({ style: "diagram_sketch" }));

    assert.match(String(proxy.onlyRequest.body["prompt"]), /explanatory diagram/);
  });

  it("sends a different style wording for a different style", async () => {
    const sketchProxy = new FakeImageGenerationProxy();
    const photographProxy = new FakeImageGenerationProxy();

    await clientFor(sketchProxy).generateImage(imageRequest({ style: "diagram_sketch" }));
    await clientFor(photographProxy).generateImage(imageRequest({ style: "photograph" }));

    assert.notEqual(
      sketchProxy.onlyRequest.body["prompt"],
      photographProxy.onlyRequest.body["prompt"],
    );
  });

  it("reports what the provider decided to draw when it says", async () => {
    const proxy = new FakeImageGenerationProxy();
    proxy.answerWithImage(SMALLEST_VALID_PNG_BYTES, "A tidy queue diagram");

    const image = await clientFor(proxy).generateImage(imageRequest());

    assert.equal(image.revisedPrompt, "A tidy queue diagram");
  });
});

describe("refusing a request before it is sent", () => {
  it("refuses a blank prompt", async () => {
    const proxy = new FakeImageGenerationProxy();

    await assert.rejects(
      () => clientFor(proxy).generateImage(imageRequest({ prompt: "   " })),
      ImageGenerationError,
    );
  });

  it("does not call the proxy when the prompt is blank", async () => {
    const proxy = new FakeImageGenerationProxy();

    await clientFor(proxy)
      .generateImage(imageRequest({ prompt: "" }))
      .catch(() => undefined);

    assert.equal(proxy.requests.length, 0);
  });

  it("refuses a prompt longer than the cap", async () => {
    const proxy = new FakeImageGenerationProxy();
    const tooLongPrompt = "x".repeat(LONGEST_PROMPT_CHARACTERS + 1);

    await assert.rejects(
      () => clientFor(proxy).generateImage(imageRequest({ prompt: tooLongPrompt })),
      /at most 1000 characters/,
    );
  });

  it("refuses a size the provider does not offer", async () => {
    const proxy = new FakeImageGenerationProxy();

    await assert.rejects(
      () =>
        clientFor(proxy).generateImage(
          imageRequest({ size: "4096x4096" as ImageGenerationRequest["size"] }),
        ),
      /Field size must be one of/,
    );
  });

  it("refuses to be built without a proxy credential", () => {
    assert.throws(
      () =>
        new ShopifyAiProxyImageClient({
          fetchImplementation: new FakeImageGenerationProxy().fetch,
          authorizationHeaderValue: "   ",
        }),
      /devx pi/,
    );
  });

  it("sends the credential exactly as it was given, not wrapped again", async () => {
    const proxy = new FakeImageGenerationProxy();
    proxy.answerWithImage(SMALLEST_VALID_PNG_BYTES);

    await clientFor(proxy).generateImage(imageRequest());

    assert.equal(proxy.onlyRequest.authorization, "Bearer shopify-test-key");
  });
});

describe("handling what the proxy answers", () => {
  it("names a refused key separately from any other failure", async () => {
    const proxy = new FakeImageGenerationProxy();
    proxy.answerWithStatus(401);

    await assert.rejects(
      () => clientFor(proxy).generateImage(imageRequest()),
      (cause: unknown) => {
        assert.ok(cause instanceof ImageGenerationError);
        assert.equal(cause.failure, "not_authorised");
        return true;
      },
    );
  });

  it("names a refused prompt separately from a proxy that is down", async () => {
    const proxy = new FakeImageGenerationProxy();
    proxy.answerWithStatus(400);

    await assert.rejects(
      () => clientFor(proxy).generateImage(imageRequest()),
      (cause: unknown) => {
        assert.ok(cause instanceof ImageGenerationError);
        assert.equal(cause.failure, "provider_refused");
        return true;
      },
    );
  });

  it("reports a proxy that cannot be reached", async () => {
    const proxy = new FakeImageGenerationProxy();
    proxy.answerByFailingToConnect();

    await assert.rejects(
      () => clientFor(proxy).generateImage(imageRequest()),
      (cause: unknown) => {
        assert.ok(cause instanceof ImageGenerationError);
        assert.equal(cause.failure, "provider_unavailable");
        return true;
      },
    );
  });

  it("refuses a reply that is not JSON", async () => {
    const proxy = new FakeImageGenerationProxy();
    proxy.answerWithBody("not json at all");

    await assert.rejects(
      () => clientFor(proxy).generateImage(imageRequest()),
      (cause: unknown) => {
        assert.ok(cause instanceof ImageGenerationError);
        assert.equal(cause.failure, "unreadable_response");
        return true;
      },
    );
  });

  it("refuses a reply with no image in it", async () => {
    const proxy = new FakeImageGenerationProxy();
    proxy.answerWithBody(JSON.stringify({ data: [{}] }));

    await assert.rejects(
      () => clientFor(proxy).generateImage(imageRequest()),
      /without an image/,
    );
  });

  it("refuses bytes that are not a PNG, whatever the reply claimed", async () => {
    const proxy = new FakeImageGenerationProxy();
    proxy.answerWithBody(
      JSON.stringify({ data: [{ b64_json: Buffer.from("<html>").toString("base64") }] }),
    );

    await assert.rejects(() => clientFor(proxy).generateImage(imageRequest()), /not a PNG/);
  });

  it("refuses an image bigger than the cap without decoding it", async () => {
    const proxy = new FakeImageGenerationProxy();
    const oversizedBase64 = "A".repeat(Math.ceil((LARGEST_IMAGE_BYTES / 3) * 4) + 8);
    proxy.answerWithBody(JSON.stringify({ data: [{ b64_json: oversizedBase64 }] }));

    await assert.rejects(
      () => clientFor(proxy).generateImage(imageRequest()),
      (cause: unknown) => {
        assert.ok(cause instanceof ImageGenerationError);
        assert.equal(cause.failure, "response_too_large");
        return true;
      },
    );
  });

  it("refuses a reply that declares more bytes than the budget", async () => {
    const proxy = new FakeImageGenerationProxy();
    proxy.answerWithBody("{}", { "content-length": String(64 * 1024 * 1024) });

    await assert.rejects(
      () => clientFor(proxy).generateImage(imageRequest()),
      (cause: unknown) => {
        assert.ok(cause instanceof ImageGenerationError);
        assert.equal(cause.failure, "response_too_large");
        return true;
      },
    );
  });
});
