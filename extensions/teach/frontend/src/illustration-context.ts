import { createContext, useContext } from "react";

import type { IllustrationProgress } from "../../shared/visuals/illustration-state.ts";

/**
 * Where each picture in the lesson has got to.
 *
 * An image beat says what was asked for and never changes. Whether the picture is
 * being drawn, has arrived, or failed arrives separately over the lesson socket, so
 * it is held here rather than on the beat: a context means one image beat re-renders
 * when its own picture arrives, without the beat list being rebuilt.
 */
export const IllustrationContext = createContext<ReadonlyMap<string, IllustrationProgress>>(
  new Map(),
);

export function useIllustration(illustrationId: string): IllustrationProgress | null {
  return useContext(IllustrationContext).get(illustrationId) ?? null;
}
