import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseGithubUrl } from "../../src/references/github-url.ts";
import { InvalidReferenceError } from "../../src/references/reference.ts";

function parse(link: string) {
  return parseGithubUrl(new URL(link));
}

describe("parseGithubUrl", () => {
  it("reads a repository link", () => {
    assert.deepEqual(parse("https://github.com/shopify/teach"), {
      kind: "repository",
      owner: "shopify",
      repository: "teach",
    });
  });

  it("reads an issue link", () => {
    assert.deepEqual(parse("https://github.com/shopify/teach/issues/42"), {
      kind: "issue",
      owner: "shopify",
      repository: "teach",
      number: 42,
    });
  });

  it("reads a pull request link", () => {
    assert.deepEqual(parse("https://github.com/shopify/teach/pull/7"), {
      kind: "pull_request",
      owner: "shopify",
      repository: "teach",
      number: 7,
    });
  });

  it("reads a file link with its branch and path", () => {
    assert.deepEqual(parse("https://github.com/shopify/teach/blob/main/src/app/main.ts"), {
      kind: "file",
      owner: "shopify",
      repository: "teach",
      gitReference: "main",
      filePath: "src/app/main.ts",
    });
  });

  it("refuses a file path that steps out of the repository", () => {
    assert.throws(
      () => parse("https://github.com/shopify/teach/blob/main/..%2F..%2Fetc%2Fpasswd"),
      InvalidReferenceError,
    );
  });

  it("refuses a page that is not a repository, issue, pull request or file", () => {
    assert.throws(() => parse("https://github.com/shopify/teach/settings"), InvalidReferenceError);
  });

  it("refuses a link that is not on github.com", () => {
    assert.throws(() => parse("https://gitlab.com/shopify/teach"), InvalidReferenceError);
  });

  it("refuses the documentation site, which is a web page and not a repository", () => {
    assert.throws(
      () => parse("https://docs.github.com/en/rest/quickstart"),
      InvalidReferenceError,
    );
  });

  it("refuses an issue link with no number", () => {
    assert.throws(
      () => parse("https://github.com/shopify/teach/issues"),
      InvalidReferenceError,
    );
  });
});

describe("parseGithubUrl reading a gist", () => {
  it("reads a gist written as owner and id", () => {
    assert.deepEqual(parse("https://gist.github.com/shopify/aaaabbbbccccddddeeeeffff00001111"), {
      kind: "gist",
      gistId: "aaaabbbbccccddddeeeeffff00001111",
    });
  });

  it("reads a gist written as the id on its own", () => {
    assert.deepEqual(parse("https://gist.github.com/aaaabbbbccccddddeeeeffff00001111"), {
      kind: "gist",
      gistId: "aaaabbbbccccddddeeeeffff00001111",
    });
  });

  it("reads the gist itself when the link points at one revision of it", () => {
    assert.deepEqual(
      parse("https://gist.github.com/shopify/aaaabbbbccccddddeeeeffff00001111/revisions"),
      { kind: "gist", gistId: "aaaabbbbccccddddeeeeffff00001111" },
    );
  });

  it("refuses a gist link with no gist id in it", () => {
    assert.throws(() => parse("https://gist.github.com/shopify"), InvalidReferenceError);
  });

  it("refuses a gist id that is not a gist id", () => {
    assert.throws(
      () => parse("https://gist.github.com/shopify/not-a-gist-id"),
      InvalidReferenceError,
    );
  });
});
