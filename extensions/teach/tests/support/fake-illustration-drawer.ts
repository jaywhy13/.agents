import { createHash } from "node:crypto";

import type { IllustrationRequest } from "../../shared/visuals/illustration-request.ts";
import type { IllustrationState } from "../../shared/visuals/illustration-state.ts";
import type { IllustrationDrawer } from "../../src/services/lesson-illustrator.ts";

/**
 * Draws nothing. It stands in for the whole picture path — proxy, disk, cache — so a
 * lesson test can drive the parts that matter: that the beat is published before the
 * drawing finishes, and that a failed drawing is a published state rather than a
 * failed turn.
 *
 * A drawing does not finish until the test says so, which is how a test can look at
 * the lesson while a picture is still being drawn.
 */
export class FakeIllustrationDrawer {
  readonly requests: Array<{ readonly lessonId: string; readonly request: IllustrationRequest }> =
    [];
  readonly publishedStates: IllustrationState[] = [];

  /** Set to make every drawing fail, the way a refused prompt would. */
  failureReason: string | null = null;

  private publishState: ((state: IllustrationState) => void) | null = null;
  private pending: Array<() => void> = [];
  private finishAtOnce = true;

  /** Binds the drawer to the sink the conductor gives it for one lesson. */
  boundTo(publishState: (state: IllustrationState) => void): IllustrationDrawer {
    this.publishState = publishState;
    return {
      illustrationIdFor: (request) => illustrationIdOf(request),
      illustrate: (lessonId, request) => this.illustrate(lessonId, request),
    };
  }

  /** Makes drawings wait, so a test can look at a lesson mid-drawing. */
  holdDrawings(): void {
    this.finishAtOnce = false;
  }

  /** Lets every held drawing finish. */
  releaseDrawings(): void {
    const held = this.pending;
    this.pending = [];
    for (const release of held) {
      release();
    }
  }

  private async illustrate(
    lessonId: string,
    request: IllustrationRequest,
  ): Promise<IllustrationState> {
    this.requests.push({ lessonId, request });
    const illustrationId = illustrationIdOf(request);
    this.publish({
      status: "generating",
      illustrationId,
      lessonId,
      alternativeText: request.alternativeText,
      requestedAt: "2024-05-01T10:00:00.000Z",
    });

    if (!this.finishAtOnce) {
      await new Promise<void>((resolve) => this.pending.push(resolve));
    }

    if (this.failureReason !== null) {
      return this.publish({
        status: "failed",
        illustrationId,
        lessonId,
        alternativeText: request.alternativeText,
        reason: this.failureReason,
        failedAt: "2024-05-01T10:00:01.000Z",
      });
    }

    return this.publish({
      status: "ready",
      illustrationId,
      lessonId,
      alternativeText: request.alternativeText,
      imagePath: `/tmp/${lessonId}/images/${illustrationId}.png`,
      mediaType: "image/png",
      byteCount: 1024,
      readyAt: "2024-05-01T10:00:01.000Z",
    });
  }

  private publish<T extends IllustrationState>(state: T): T {
    this.publishedStates.push(state);
    this.publishState?.(state);
    return state;
  }
}

/** The same idea as the real content hash: the same request gives the same id. */
export function illustrationIdOf(request: IllustrationRequest): string {
  return createHash("sha256")
    .update(JSON.stringify([request.prompt, request.size, request.style]), "utf8")
    .digest("hex");
}
