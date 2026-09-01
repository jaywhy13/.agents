import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import type { IllustrationRequest, IllustrationState } from "../../shared/visuals/illustration-state.ts";
import { illustrationIdFor, IllustrationService } from "../../src/visuals/illustration-service.ts";
import { LessonImageRepository } from "../../src/visuals/lesson-image-repository.ts";
import { ShopifyAiProxyImageClient } from "../../src/visuals/shopify-ai-proxy-image-client.ts";
import {
  FakeImageGenerationProxy,
  SMALLEST_VALID_PNG_BYTES,
} from "./support/fake-image-generation-proxy.ts";

const A_FIXED_TIME = new Date("2024-05-01T10:00:00.000Z");

function illustrationRequest(overrides: Partial<IllustrationRequest> = {}): IllustrationRequest {
  return {
    prompt: "A message queue between a producer and a consumer",
    size: "1024x1024",
    style: "diagram_sketch",
    alternativeText: "A queue with a producer on one side and a consumer on the other",
    ...overrides,
  };
}

interface IllustrationSetup {
  readonly service: IllustrationService;
  readonly proxy: FakeImageGenerationProxy;
  readonly publishedStates: IllustrationState[];
  readonly imageRepository: LessonImageRepository;
}

async function illustrationSetup(): Promise<IllustrationSetup> {
  const proxy = new FakeImageGenerationProxy();
  const publishedStates: IllustrationState[] = [];
  const imageRepository = new LessonImageRepository(
    await mkdtemp(path.join(tmpdir(), "teach-illustrations-")),
  );

  return {
    proxy,
    publishedStates,
    imageRepository,
    service: new IllustrationService({
      imageClient: new ShopifyAiProxyImageClient({
        fetchImplementation: proxy.fetch,
        authorizationHeaderValue: "Bearer shopify-test-key",
      }),
      imageRepository,
      publishState: (state) => publishedStates.push(state),
      now: () => A_FIXED_TIME,
    }),
  };
}

describe("getting an illustration for a lesson", () => {
  it("says it is generating before it says it is ready", async () => {
    const { service, publishedStates } = await illustrationSetup();

    await service.illustrate("lesson-abc123", illustrationRequest());

    assert.deepEqual(
      publishedStates.map((state) => state.status),
      ["generating", "ready"],
    );
  });

  it("says where the image ended up once it is ready", async () => {
    const { service } = await illustrationSetup();

    const state = await service.illustrate("lesson-abc123", illustrationRequest());

    assert.equal(state.status, "ready");
    assert.ok(state.status === "ready" && state.imagePath.endsWith(".png"));
  });

  it("stores the image so the lesson can serve it", async () => {
    const { service, imageRepository } = await illustrationSetup();

    const state = await service.illustrate("lesson-abc123", illustrationRequest());

    const bytes = await imageRepository.readBytes("lesson-abc123", state.illustrationId);
    assert.deepEqual(bytes, SMALLEST_VALID_PNG_BYTES);
  });

  it("carries the alternative text through, so the picture is never unlabelled", async () => {
    const { service } = await illustrationSetup();

    const state = await service.illustrate(
      "lesson-abc123",
      illustrationRequest({ alternativeText: "Two boxes joined by an arrow" }),
    );

    assert.equal(state.alternativeText, "Two boxes joined by an arrow");
  });
});

describe("caching an illustration by what was asked for", () => {
  it("does not ask the provider twice for the same picture", async () => {
    const { service, proxy } = await illustrationSetup();
    await service.illustrate("lesson-abc123", illustrationRequest());

    await service.illustrate("lesson-abc123", illustrationRequest());

    assert.equal(proxy.requests.length, 1);
  });

  it("goes straight to ready on a cache hit, without saying it is generating again", async () => {
    const { service, publishedStates } = await illustrationSetup();
    await service.illustrate("lesson-abc123", illustrationRequest());
    publishedStates.length = 0;

    await service.illustrate("lesson-abc123", illustrationRequest());

    assert.deepEqual(
      publishedStates.map((state) => state.status),
      ["ready"],
    );
  });

  it("asks again for a different prompt", async () => {
    const { service, proxy } = await illustrationSetup();
    await service.illustrate("lesson-abc123", illustrationRequest());

    await service.illustrate("lesson-abc123", illustrationRequest({ prompt: "Something else" }));

    assert.equal(proxy.requests.length, 2);
  });

  it("asks again for a different style, because the picture would differ", async () => {
    const { service, proxy } = await illustrationSetup();
    await service.illustrate("lesson-abc123", illustrationRequest());

    await service.illustrate("lesson-abc123", illustrationRequest({ style: "photograph" }));

    assert.equal(proxy.requests.length, 2);
  });

  it("does not reuse one lesson's image in another lesson", async () => {
    const { service, proxy } = await illustrationSetup();
    await service.illustrate("lesson-one", illustrationRequest());

    await service.illustrate("lesson-two", illustrationRequest());

    assert.equal(proxy.requests.length, 2);
  });

  it("gives the same picture the same id, whichever lesson asked", () => {
    assert.equal(
      illustrationIdFor(illustrationRequest()),
      illustrationIdFor(illustrationRequest()),
    );
  });

  it("does not let alternative text change the id, because it is not sent", () => {
    assert.equal(
      illustrationIdFor(illustrationRequest({ alternativeText: "One wording" })),
      illustrationIdFor(illustrationRequest({ alternativeText: "Another wording" })),
    );
  });

  it("joins a request already in flight rather than paying twice", async () => {
    const { service, proxy } = await illustrationSetup();

    await Promise.all([
      service.illustrate("lesson-abc123", illustrationRequest()),
      service.illustrate("lesson-abc123", illustrationRequest()),
    ]);

    assert.equal(proxy.requests.length, 1);
  });
});

describe("when the picture cannot be made", () => {
  it("publishes a failure rather than throwing, so the lesson carries on", async () => {
    const { service, proxy } = await illustrationSetup();
    proxy.answerWithStatus(500);

    const state = await service.illustrate("lesson-abc123", illustrationRequest());

    assert.equal(state.status, "failed");
  });

  it("says why, in words the learner can read", async () => {
    const { service, proxy } = await illustrationSetup();
    proxy.answerWithStatus(401);

    const state = await service.illustrate("lesson-abc123", illustrationRequest());

    assert.ok(state.status === "failed" && state.reason.includes("devx pi"));
  });

  it("says it was generating before it says it failed", async () => {
    const { service, proxy, publishedStates } = await illustrationSetup();
    proxy.answerWithStatus(500);

    await service.illustrate("lesson-abc123", illustrationRequest());

    assert.deepEqual(
      publishedStates.map((state) => state.status),
      ["generating", "failed"],
    );
  });

  it("fails without calling the provider when the request itself is wrong", async () => {
    const { service, proxy } = await illustrationSetup();

    const state = await service.illustrate("lesson-abc123", illustrationRequest({ prompt: "" }));

    assert.equal(state.status, "failed");
    assert.equal(proxy.requests.length, 0);
  });

  it("publishes a failure when the image cannot be stored", async () => {
    const proxy = new FakeImageGenerationProxy();
    const publishedStates: IllustrationState[] = [];
    const serviceWithFullDisk = new IllustrationService({
      imageClient: new ShopifyAiProxyImageClient({
        fetchImplementation: proxy.fetch,
        authorizationHeaderValue: "Bearer shopify-test-key",
      }),
      imageRepository: {
        get: async () => null,
        create: async () => {
          throw new Error("no space left on device");
        },
      },
      publishState: (state) => publishedStates.push(state),
      now: () => A_FIXED_TIME,
    });

    const state = await serviceWithFullDisk.illustrate("lesson-abc123", illustrationRequest());

    assert.equal(state.status, "failed");
    assert.ok(state.status === "failed" && state.reason.includes("no space left on device"));
  });

  it("treats a cache record it cannot read as a miss, rather than a failed lesson", async () => {
    const proxy = new FakeImageGenerationProxy();
    const serviceWithUnreadableCache = new IllustrationService({
      imageClient: new ShopifyAiProxyImageClient({
        fetchImplementation: proxy.fetch,
        authorizationHeaderValue: "Bearer shopify-test-key",
      }),
      imageRepository: {
        get: async () => {
          throw new Error("the record is not JSON");
        },
        create: async (_lessonId, illustration) => ({
          illustrationId: illustration.illustrationId,
          imagePath: `/tmp/${illustration.illustrationId}.png`,
          byteCount: illustration.bytes.byteLength,
          prompt: illustration.prompt,
          size: illustration.size,
          style: illustration.style,
          model: illustration.model,
          createdAt: illustration.createdAt,
        }),
      },
      publishState: () => undefined,
      now: () => A_FIXED_TIME,
    });

    const state = await serviceWithUnreadableCache.illustrate(
      "lesson-abc123",
      illustrationRequest(),
    );

    assert.equal(state.status, "ready");
  });

  it("tries again after a failure rather than caching the failure", async () => {
    const { service, proxy } = await illustrationSetup();
    proxy.answerWithStatus(500);
    await service.illustrate("lesson-abc123", illustrationRequest());
    proxy.answerWithImage();

    const state = await service.illustrate("lesson-abc123", illustrationRequest());

    assert.equal(state.status, "ready");
  });
});
