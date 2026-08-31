import type { BeatKind } from "./beat.ts";

/**
 * The beats the lesson page draws.
 *
 * Narration is the words the lesson would say out loud about another beat, so it
 * is left out: drawing it would show the learner the same idea twice, once as the
 * beat and once as its script.
 */
export function beatsShownOnScreen<T extends { readonly kind: BeatKind }>(
  beats: readonly T[],
): readonly T[] {
  return beats.filter((beat) => beat.kind !== "narration");
}
