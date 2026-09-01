import { createContext, useContext } from "react";

import type { GlossaryEntry } from "../../shared/glossary.ts";

/**
 * The glossary the learner can see. Every beat renderer marks the terms in its own
 * prose, so the glossary travels in context rather than through every beat's props.
 */
export const GlossaryContext = createContext<readonly GlossaryEntry[]>([]);

export function useGlossary(): readonly GlossaryEntry[] {
  return useContext(GlossaryContext);
}
