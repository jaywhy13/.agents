import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GithubReferenceClient } from "../../src/references/github-reference-client.ts";
import type { GithubReference } from "../../src/references/reference.ts";
import { ReferenceCopyError } from "../../src/references/reference.ts";
import { normalizeReference } from "../../src/references/reference-normalizer.ts";
import { base64Content, FakeGithubApiRunner } from "./support/fake-github-api-runner.ts";

function githubReference(link: string, label = "The reference"): GithubReference {
  const reference = normalizeReference({ kind: "github", label, value: link });
  assert.equal(reference.kind, "github");
  return reference as GithubReference;
}

describe("GithubReferenceClient", () => {
  it("copies a repository description and its readme", async () => {
    const githubApiRunner = new FakeGithubApiRunner()
      .answerWith("repos/shopify/teach", { description: "A teaching extension." })
      .answerWith("repos/shopify/teach/readme", base64Content("# Teach\n\nHow to run it."));

    const content = await new GithubReferenceClient(githubApiRunner).copy(
      githubReference("https://github.com/shopify/teach"),
    );

    assert.match(content.text, /A teaching extension\./);
    assert.match(content.text, /How to run it\./);
  });

  it("copies a repository that has no readme", async () => {
    const githubApiRunner = new FakeGithubApiRunner()
      .answerWith("repos/shopify/teach", { description: "A teaching extension." })
      .failWith("repos/shopify/teach/readme", 404);

    const content = await new GithubReferenceClient(githubApiRunner).copy(
      githubReference("https://github.com/shopify/teach"),
    );

    assert.match(content.text, /A teaching extension\./);
  });

  it("copies the title and body of an issue", async () => {
    const githubApiRunner = new FakeGithubApiRunner().answerWith(
      "repos/shopify/teach/issues/42",
      { title: "Queues arrive out of order", body: "Steps to see it." },
    );

    const content = await new GithubReferenceClient(githubApiRunner).copy(
      githubReference("https://github.com/shopify/teach/issues/42"),
    );

    assert.equal(content.title, "Queues arrive out of order");
    assert.match(content.text, /Steps to see it\./);
  });

  it("asks the pulls endpoint for a pull request", async () => {
    const githubApiRunner = new FakeGithubApiRunner().answerWith("repos/shopify/teach/pulls/7", {
      title: "Fix the ordering",
      body: "One line change.",
    });

    await new GithubReferenceClient(githubApiRunner).copy(
      githubReference("https://github.com/shopify/teach/pull/7"),
    );

    assert.deepEqual(githubApiRunner.requestedApiPaths, ["repos/shopify/teach/pulls/7"]);
  });

  it("decodes a file and keeps its text", async () => {
    const githubApiRunner = new FakeGithubApiRunner().answerWith(
      "repos/shopify/teach/contents/src/app/main.ts?ref=main",
      base64Content("export const value = 1;\n"),
    );

    const content = await new GithubReferenceClient(githubApiRunner).copy(
      githubReference("https://github.com/shopify/teach/blob/main/src/app/main.ts"),
    );

    assert.equal(content.text, "export const value = 1;\n");
  });

  it("asks only for named parts, never for the link text", async () => {
    const githubApiRunner = new FakeGithubApiRunner().answerWith(
      "repos/shopify/teach/issues/42",
      { title: "A title", body: "A body" },
    );

    await new GithubReferenceClient(githubApiRunner).copy(
      githubReference("https://github.com/shopify/teach/issues/42"),
    );

    for (const requestedApiPath of githubApiRunner.requestedApiPaths) {
      assert.ok(!requestedApiPath.includes("github.com"), requestedApiPath);
      assert.ok(!requestedApiPath.includes("://"), requestedApiPath);
    }
  });

  it("refuses a file that is not text", async () => {
    const githubApiRunner = new FakeGithubApiRunner().answerWith(
      "repos/shopify/teach/contents/logo.png?ref=main",
      { encoding: "base64", content: Buffer.from([0x89, 0x50, 0x00, 0x01]).toString("base64") },
    );

    await assert.rejects(
      new GithubReferenceClient(githubApiRunner).copy(
        githubReference("https://github.com/shopify/teach/blob/main/logo.png"),
      ),
      ReferenceCopyError,
    );
  });

  it("copies a gist's files, each under its own name", async () => {
    const githubApiRunner = new FakeGithubApiRunner().answerWith(
      "gists/aaaabbbbccccddddeeeeffff00001111",
      {
        description: "Two ways to drain a queue",
        files: {
          "drain.ts": { filename: "drain.ts", content: "await queue.drain();" },
          "notes.md": { filename: "notes.md", content: "Drain before shutdown." },
        },
      },
    );

    const content = await new GithubReferenceClient(githubApiRunner).copy(
      githubReference("https://gist.github.com/shopify/aaaabbbbccccddddeeeeffff00001111"),
    );

    assert.equal(content.title, "Two ways to drain a queue");
    assert.match(content.text, /## drain\.ts/);
    assert.match(content.text, /await queue\.drain\(\);/);
    assert.match(content.text, /## notes\.md/);
    assert.match(content.text, /Drain before shutdown\./);
  });

  it("names a gist by its id when it has no description", async () => {
    const githubApiRunner = new FakeGithubApiRunner().answerWith(
      "gists/aaaabbbbccccddddeeeeffff00001111",
      { files: { "drain.ts": { content: "await queue.drain();" } } },
    );

    const content = await new GithubReferenceClient(githubApiRunner).copy(
      githubReference("https://gist.github.com/aaaabbbbccccddddeeeeffff00001111"),
    );

    assert.equal(content.title, "gist aaaabbbbccccddddeeeeffff00001111");
  });

  it("refuses a gist with no text in it", async () => {
    const githubApiRunner = new FakeGithubApiRunner().answerWith(
      "gists/aaaabbbbccccddddeeeeffff00001111",
      { description: "Empty", files: {} },
    );

    await assert.rejects(
      new GithubReferenceClient(githubApiRunner).copy(
        githubReference("https://gist.github.com/aaaabbbbccccddddeeeeffff00001111"),
      ),
      ReferenceCopyError,
    );
  });

  it("asks for a gist by its id and never by its address", async () => {
    const githubApiRunner = new FakeGithubApiRunner().answerWith(
      "gists/aaaabbbbccccddddeeeeffff00001111",
      { files: { "drain.ts": { content: "await queue.drain();" } } },
    );

    await new GithubReferenceClient(githubApiRunner).copy(
      githubReference("https://gist.github.com/shopify/aaaabbbbccccddddeeeeffff00001111"),
    );

    assert.deepEqual(githubApiRunner.requestedApiPaths, [
      "gists/aaaabbbbccccddddeeeeffff00001111",
    ]);
  });

  it("reports a missing issue as a copy failure", async () => {
    const githubApiRunner = new FakeGithubApiRunner().failWith(
      "repos/shopify/teach/issues/99",
      404,
    );

    await assert.rejects(
      new GithubReferenceClient(githubApiRunner).copy(
        githubReference("https://github.com/shopify/teach/issues/99"),
      ),
      ReferenceCopyError,
    );
  });
});
