import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InvalidReferenceError } from "../../src/references/reference.ts";
import { normalizeReference } from "../../src/references/reference-normalizer.ts";

describe("normalizeReference", () => {
  it("keeps an ordinary https link as a url reference", () => {
    const reference = normalizeReference({
      kind: "url",
      label: "Queue docs",
      value: "https://example.com/queues",
    });

    assert.equal(reference.kind, "url");
    assert.equal(reference.kind === "url" ? reference.url : null, "https://example.com/queues");
  });

  it("drops the fragment so two links to one page are one reference", () => {
    const linkWithFragment = normalizeReference({
      kind: "url",
      label: "Queue docs",
      value: "https://example.com/queues#ordering",
    });

    assert.equal(
      linkWithFragment.kind === "url" ? linkWithFragment.url : null,
      "https://example.com/queues",
    );
  });

  it("reads a github.com link as a github reference even when the learner chose url", () => {
    const reference = normalizeReference({
      kind: "url",
      label: "The repository",
      value: "https://github.com/shopify/teach",
    });

    assert.equal(reference.kind, "github");
    assert.deepEqual(reference.kind === "github" ? reference.target : null, {
      kind: "repository",
      owner: "shopify",
      repository: "teach",
    });
  });

  it("reads a gist link as a github reference", () => {
    const reference = normalizeReference({
      kind: "url",
      label: "The snippet",
      value: "https://gist.github.com/shopify/aaaabbbbccccddddeeeeffff00001111",
    });

    assert.equal(reference.kind, "github");
    assert.deepEqual(reference.kind === "github" ? reference.target : null, {
      kind: "gist",
      gistId: "aaaabbbbccccddddeeeeffff00001111",
    });
  });

  it("keeps the GitHub documentation site as an ordinary web page", () => {
    const reference = normalizeReference({
      kind: "url",
      label: "The REST guide",
      value: "https://docs.github.com/en/rest/quickstart",
    });

    assert.equal(reference.kind, "url");
  });

  it("refuses a github reference that is not a github.com link", () => {
    assert.throws(
      () =>
        normalizeReference({
          kind: "github",
          label: "Not GitHub",
          value: "https://example.com/shopify/teach",
        }),
      InvalidReferenceError,
    );
  });

  it("refuses a link that is not http or https", () => {
    assert.throws(
      () => normalizeReference({ kind: "url", label: "A file", value: "file:///etc/passwd" }),
      InvalidReferenceError,
    );
  });

  it("refuses a link that carries a username and password", () => {
    assert.throws(
      () =>
        normalizeReference({
          kind: "url",
          label: "Sneaky",
          value: "https://user:secret@example.com/page",
        }),
      InvalidReferenceError,
    );
  });

  it("turns pasted text into a pasted reference with newline line endings", () => {
    const reference = normalizeReference({
      kind: "pasted",
      label: "My notes",
      value: "first line\r\nsecond line\r\n",
    });

    assert.equal(reference.kind === "pasted" ? reference.text : null, "first line\nsecond line");
  });

  it("refuses pasted text that is only whitespace", () => {
    assert.throws(
      () => normalizeReference({ kind: "pasted", label: "Empty", value: "   \n  " }),
      InvalidReferenceError,
    );
  });

  it("refuses a reference with a blank label", () => {
    assert.throws(
      () => normalizeReference({ kind: "url", label: "  ", value: "https://example.com" }),
      InvalidReferenceError,
    );
  });
});
