import type { PastedTextReference, ReferenceContent } from "./reference.ts";
import { ReferenceCopyError } from "./reference.ts";

/**
 * Pasted text is already here, so this client only has to say what it is. It still
 * exists as a client so the service handles all three reference kinds the same
 * way, instead of branching into a special case for the one that needs no work.
 */
export class PastedTextReferenceClient {
  async copy(reference: PastedTextReference): Promise<ReferenceContent> {
    if (reference.text.trim().length === 0) {
      throw new ReferenceCopyError(`${reference.label} has no text in it.`);
    }
    return {
      text: reference.text,
      mediaType: "text/plain",
      sourceUrl: null,
      title: reference.label,
    };
  }
}
