/**
 * Gets a picture for a lesson, and says where it has got to while it does.
 *
 * Three things make this more than a call to the image client:
 *
 * - **It publishes rather than returns.** Generating takes seconds, so the page is
 *   told `generating` at once, and `ready` or `failed` later. The lesson never
 *   waits on a picture.
 * - **It caches by content hash.** The hash is taken over exactly what would be
 *   sent to the provider, so the same request finds the image already on disk and
 *   costs nothing. A lesson revisits the same idea often.
 * - **It never throws.** A missing picture is a smaller problem than a broken
 *   lesson, so a failure becomes a `failed` state with a plain reason.
 *
 * Requests for the same picture that arrive while the first is still in flight join
 * the one already running, so a page that reconnects does not pay twice.
 */

import { createHash } from "node:crypto";

import type {
  FailedIllustration,
  IllustrationRequest,
  IllustrationState,
  ReadyIllustration,
} from "../../shared/visuals/illustration-state.ts";
import type { NewIllustration, StoredIllustration } from "./lesson-image-repository.ts";
import type {
  GeneratedImage,
  ImageGenerationRequest,
} from "./shopify-ai-proxy-image-client.ts";
import {
  fullPromptFor,
  IMAGE_MODEL,
  ImageGenerationError,
} from "./shopify-ai-proxy-image-client.ts";

export type IllustrationStatePublisher = (state: IllustrationState) => void;

/**
 * The two things this service needs from the outside, named by the service rather
 * than taken from the classes that happen to provide them. `LessonImageRepository`
 * and `ShopifyAiProxyImageClient` both satisfy these already; a test can satisfy
 * them with something much smaller.
 */
export interface IllustrationImageStore {
  get(lessonId: string, illustrationId: string): Promise<StoredIllustration | null>;
  create(lessonId: string, illustration: NewIllustration): Promise<StoredIllustration>;
}

export interface IllustrationImageGenerator {
  generateImage(request: ImageGenerationRequest): Promise<GeneratedImage>;
}

export interface IllustrationServiceOptions {
  readonly imageClient: IllustrationImageGenerator;
  readonly imageRepository: IllustrationImageStore;
  readonly publishState: IllustrationStatePublisher;
  /** Injected so a test can assert on the timestamps it sees. */
  readonly now: () => Date;
}

export class IllustrationService {
  private readonly imageClient: IllustrationImageGenerator;
  private readonly imageRepository: IllustrationImageStore;
  private readonly publishState: IllustrationStatePublisher;
  private readonly now: () => Date;
  private readonly inFlightByIllustrationId = new Map<string, Promise<IllustrationState>>();

  constructor(options: IllustrationServiceOptions) {
    this.imageClient = options.imageClient;
    this.imageRepository = options.imageRepository;
    this.publishState = options.publishState;
    this.now = options.now;
  }

  /**
   * Resolves once the picture is ready or has failed. The caller may ignore the
   * result entirely and watch the published states instead.
   */
  async illustrate(lessonId: string, request: IllustrationRequest): Promise<IllustrationState> {
    let illustrationId: string;
    try {
      illustrationId = illustrationIdFor(request);
    } catch (cause) {
      return this.publishFailure(lessonId, contentHashOfText(request.prompt), request, cause);
    }

    const alreadyStored = await this.findStored(lessonId, illustrationId);
    if (alreadyStored !== null) {
      return this.publishReady(lessonId, illustrationId, request, alreadyStored);
    }

    const alreadyRunning = this.inFlightByIllustrationId.get(illustrationId);
    if (alreadyRunning !== undefined) {
      return alreadyRunning;
    }

    const running = this.generateAndStore(lessonId, illustrationId, request);
    this.inFlightByIllustrationId.set(illustrationId, running);
    try {
      return await running;
    } finally {
      this.inFlightByIllustrationId.delete(illustrationId);
    }
  }

  private async generateAndStore(
    lessonId: string,
    illustrationId: string,
    request: IllustrationRequest,
  ): Promise<IllustrationState> {
    this.publishState({
      status: "generating",
      illustrationId,
      lessonId,
      alternativeText: request.alternativeText,
      requestedAt: this.timestamp(),
    });

    let image: GeneratedImage;
    try {
      image = await this.imageClient.generateImage({
        prompt: request.prompt,
        size: request.size,
        style: request.style,
      });
    } catch (cause) {
      return this.publishFailure(lessonId, illustrationId, request, cause);
    }

    let stored: StoredIllustration;
    try {
      stored = await this.imageRepository.create(lessonId, {
        illustrationId,
        bytes: image.bytes,
        prompt: request.prompt,
        size: request.size,
        style: request.style,
        model: image.model,
        createdAt: this.timestamp(),
      });
    } catch (cause) {
      return this.publishFailure(lessonId, illustrationId, request, cause);
    }

    return this.publishReady(lessonId, illustrationId, request, stored);
  }

  private async findStored(
    lessonId: string,
    illustrationId: string,
  ): Promise<StoredIllustration | null> {
    try {
      return await this.imageRepository.get(lessonId, illustrationId);
    } catch {
      // A cache that cannot be read is a cache miss, not a failed lesson. The
      // picture is made again and the bad record is written over.
      return null;
    }
  }

  private publishReady(
    lessonId: string,
    illustrationId: string,
    request: IllustrationRequest,
    stored: StoredIllustration,
  ): ReadyIllustration {
    const state: ReadyIllustration = {
      status: "ready",
      illustrationId,
      lessonId,
      alternativeText: request.alternativeText,
      imagePath: stored.imagePath,
      mediaType: "image/png",
      byteCount: stored.byteCount,
      readyAt: this.timestamp(),
    };
    this.publishState(state);
    return state;
  }

  private publishFailure(
    lessonId: string,
    illustrationId: string,
    request: IllustrationRequest,
    cause: unknown,
  ): FailedIllustration {
    const state: FailedIllustration = {
      status: "failed",
      illustrationId,
      lessonId,
      alternativeText: request.alternativeText,
      reason: describeFailure(cause),
      failedAt: this.timestamp(),
    };
    this.publishState(state);
    return state;
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}

/**
 * The hash covers exactly what decides the picture: the prompt as the provider will
 * receive it, the size, and the model. Two requests that would produce the same
 * call share one image; a change to the style wording changes the prompt and so
 * changes the key, which is what keeps the cache honest.
 */
export function illustrationIdFor(request: IllustrationRequest): string {
  return contentHashOfText(
    JSON.stringify({
      prompt: fullPromptFor({ prompt: request.prompt, size: request.size, style: request.style }),
      size: request.size,
      model: IMAGE_MODEL,
    }),
  );
}

function contentHashOfText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function describeFailure(cause: unknown): string {
  if (cause instanceof ImageGenerationError) {
    return cause.message;
  }
  return cause instanceof Error ? cause.message : String(cause);
}
