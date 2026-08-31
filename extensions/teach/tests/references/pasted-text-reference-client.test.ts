import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PastedTextReferenceClient } from "../../src/references/pasted-text-reference-client.ts";
import { ReferenceCopyError } from "../../src/references/reference.ts";

describe("PastedTextReferenceClient", () => {
  it("keeps the pasted text as the content", async () => {
    const content = await new PastedTextReferenceClient().copy({
      kind: "pasted",
      label: "My notes",
      text: "A queue keeps order.",
    });

    assert.equal(content.text, "A queue keeps order.");
    assert.equal(content.mediaType, "text/plain");
  });

  it("has no source address because nothing was fetched", async () => {
    const content = await new PastedTextReferenceClient().copy({
      kind: "pasted",
      label: "My notes",
      text: "A queue keeps order.",
    });

    assert.equal(content.sourceUrl, null);
  });

  it("refuses text that is only whitespace", async () => {
    await assert.rejects(
      new PastedTextReferenceClient().copy({ kind: "pasted", label: "Empty", text: "   " }),
      ReferenceCopyError,
    );
  });
});
