import type { NarrationChunk } from "./beat.ts";

/**
 * Narration is stored as chunks so a later speech step can treat a term or an
 * emphasis differently from a plain sentence. Everything that only needs the words
 * — a transcript, a test, a fallback caption — uses this instead.
 */
export function narrationPlainText(chunks: readonly NarrationChunk[]): string {
  return chunks.map((chunk) => chunk.text.trim()).join(" ");
}
