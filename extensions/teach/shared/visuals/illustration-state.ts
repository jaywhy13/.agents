/**
 * Where an illustration has got to.
 *
 * An image takes seconds to make, which is long enough that the lesson must say
 * something while it waits, and long enough that the wait can fail. So the state is
 * published rather than returned: the page shows a placeholder, then the picture,
 * or then the reason there is no picture — and the lesson carries on either way.
 *
 * The three states are the whole set. There is no fourth "unknown" state, because a
 * caller that has an illustration id always has one of these three.
 *
 * This module is pure: no node built-ins, so the lesson page can use it too, which
 * is why it lives under `shared/` and is covered by the page build fingerprint.
 */

import type { IllustrationRequest } from "./illustration-request.ts";

export type { IllustrationRequest };

interface IllustrationStateBase {
  /** The content hash of the request. Two identical requests share one id. */
  readonly illustrationId: string;
  readonly lessonId: string;
  readonly alternativeText: string;
}

export interface GeneratingIllustration extends IllustrationStateBase {
  readonly status: "generating";
  readonly requestedAt: string;
}

export interface ReadyIllustration extends IllustrationStateBase {
  readonly status: "ready";
  /** Where the bytes are on the learner's own machine. */
  readonly imagePath: string;
  readonly mediaType: "image/png";
  readonly byteCount: number;
  readonly readyAt: string;
}

export interface FailedIllustration extends IllustrationStateBase {
  readonly status: "failed";
  /** Said plainly, because it is shown to the learner in place of the picture. */
  readonly reason: string;
  readonly failedAt: string;
}

export type IllustrationState =
  | GeneratingIllustration
  | ReadyIllustration
  | FailedIllustration;

/**
 * A ready illustration as the lesson page is allowed to see it.
 *
 * `imagePath` is a place on the learner's own disk. The page never needs it — it
 * asks the lesson server for the bytes by lesson and illustration id — so it is
 * dropped here rather than trusted not to be used. That keeps the beat that is
 * stored, broadcast and replayed free of filesystem paths.
 */
export type ReadyIllustrationForPage = Omit<ReadyIllustration, "imagePath">;

export type IllustrationProgress =
  | GeneratingIllustration
  | ReadyIllustrationForPage
  | FailedIllustration;

/** One explicit branch per state, so a new state cannot keep the path by default. */
export function illustrationProgressOf(state: IllustrationState): IllustrationProgress {
  switch (state.status) {
    case "generating":
      return state;
    case "failed":
      return state;
    case "ready": {
      const { imagePath: pathStaysOnTheServer, ...forPage } = state;
      void pathStaysOnTheServer;
      return forPage;
    }
  }
}

/** One explicit branch per state, so a new state must state what the page says. */
export function illustrationStatusMessage(state: IllustrationProgress): string {
  switch (state.status) {
    case "generating":
      return "Drawing the picture…";
    case "ready":
      return state.alternativeText;
    case "failed":
      return `No picture this time: ${state.reason}`;
  }
}
