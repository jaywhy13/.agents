import type { IllustrationRequest } from "../../shared/visuals/illustration-request.ts";
import type { IllustrationState } from "../../shared/visuals/illustration-state.ts";

/**
 * What the conductor needs from something that can draw.
 *
 * `IllustrationService` satisfies it. The interface is declared here, in the layer
 * that uses it, so the dependency arrow points inward and a test can drive a lesson
 * that draws pictures without a provider, a proxy key, or a disk.
 *
 * `illustrate` resolves when the picture is ready or has failed, and never rejects
 * for a failed drawing: the state is published instead. `illustrationIdFor` is the
 * content hash of the request, which is both the cache key and the name the page
 * asks for the bytes by, so the beat can carry it before the drawing starts.
 */
export interface IllustrationDrawer {
  illustrationIdFor(request: IllustrationRequest): string;
  illustrate(lessonId: string, request: IllustrationRequest): Promise<IllustrationState>;
}

/**
 * Builds a drawer bound to one sink for the states it publishes. The conductor gives
 * it the current lesson's board, so a state can never be recorded against a lesson
 * that has been retired.
 */
export type IllustrationDrawerFactory = (
  publishState: (state: IllustrationState) => void,
) => IllustrationDrawer;
