import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PublisherError,
  PullRequestStoryPublisher,
  parseCanonicalPullRequestUrl,
  validateStoryInput,
} from "../scripts/publish-pr-story.mjs";

function validStory(overrides = {}) {
  return {
    title: "Make retries visible",
    summary: "Operators can distinguish retries from first attempts.",
    link: "https://github.com/shop/example/pull/42",
    repository: "shop/example",
    number: 42,
    author: "octocat",
    background: "## Why retries were confusing\n\nThe old path created a second identity.",
    code_story: "## Carry attempt context\n\n```diff\n-old\n+new\n```\n\n## Answers\n\n1. The identifier stays stable.",
    ...overrides,
  };
}

class FakePullRequestRepository {
  constructor(records = []) {
    this.records = records;
    this.creates = [];
    this.updates = [];
  }

  async list(number) {
    return this.records.filter((record) => record.number === number);
  }

  async create(fields) {
    this.creates.push(fields);
    return { id: "created-record" };
  }

  async update(id, fields) {
    this.updates.push({ id, fields });
    return { id, ...fields };
  }
}

const fixedNow = () => new Date("2026-07-16T12:00:00.000Z");

test("accepts only a canonical GitHub pull request URL", () => {
  assert.deepEqual(parseCanonicalPullRequestUrl("https://github.com/shop/example/pull/42"), {
    link: "https://github.com/shop/example/pull/42",
    repository: "shop/example",
    number: 42,
  });
  for (const invalidLink of [
    "http://github.com/shop/example/pull/42",
    "https://github.com/shop/example/pull/42/",
    "https://github.com/shop/example/pull/42?diff=split",
    "https://github.com/shop/example/issues/42",
  ]) {
    assert.throws(() => parseCanonicalPullRequestUrl(invalidLink), PublisherError);
  }
});

test("normalizes repository casing from the canonical URL and validates optional source metadata", () => {
  const story = validateStoryInput(validStory({
    repository: "SHOP/EXAMPLE",
    watch: false,
    source_fetched_at: "2026-07-15T14:34:54.985139Z",
    source_diff_truncated: false,
  }));
  assert.equal(story.repository, "shop/example");
  assert.equal(story.watchProvided, true);
  assert.equal(story.source_fetched_at, "2026-07-15T14:34:54.985Z");
  assert.equal(story.source_diff_truncated, false);
});

test("rejects a static image without meaningful alt text", () => {
  assert.throws(
    () => validateStoryInput(validStory({ background: "## Flow\n\n![diagram](https://example.com/flow.png)" })),
    (error) => error.issues.some((issue) => issue.message.includes("meaningful alt text")),
  );
});

test("rejects a static image with an unsafe URL", () => {
  assert.throws(
    () => validateStoryInput(validStory({ background: "## Flow\n\n![Retry identity flow](javascript:alert(1))" })),
    (error) => error.issues.some((issue) => issue.message.includes("safe HTTP(S) URL")),
  );
});

test("rejects raw HTML outside code excerpts", () => {
  assert.throws(
    () => validateStoryInput(validStory({ background: "## Flow\n\n<details>hidden</details>" })),
    (error) => error.issues.some((issue) => issue.message.includes("raw HTML")),
  );
});

test("allows accessible HTTP(S) images embedded in Markdown", () => {
  const story = validateStoryInput(validStory({
    background: "## Flow\n\n![A retry keeps the original operation identifier](https://organized.quick.shopify.io/files/retry-flow.png)",
  }));
  assert.match(story.background, /retry-flow\.png/);
});

test("rejects repository and number values that disagree with the link", () => {
  assert.throws(
    () => validateStoryInput(validStory({ repository: "shop/other", number: 43 })),
    (error) => {
      assert.ok(error.issues.some((issue) => issue.field === "repository"));
      assert.ok(error.issues.some((issue) => issue.field === "number"));
      return true;
    },
  );
});

test("requires boolean watch and source truncation values when present", () => {
  assert.throws(
    () => validateStoryInput(validStory({ watch: "false", source_diff_truncated: 0 })),
    (error) => {
      assert.ok(error.issues.some((issue) => issue.field === "watch"));
      assert.ok(error.issues.some((issue) => issue.field === "source_diff_truncated"));
      return true;
    },
  );
});

test("creates a user-owned record without mutating another owner's matching record", async () => {
  const repository = new FakePullRequestRepository([{
    id: "other-owner-record",
    repository: "shop/example",
    number: 42,
    created_by: "other@shopify.com",
    watch: true,
  }]);
  const publisher = new PullRequestStoryPublisher(repository, { now: fixedNow });

  const published = await publisher.publish(validStory(), "reader@shopify.com");

  assert.equal(published.action, "create");
  assert.equal(published.id, "created-record");
  assert.equal(repository.updates.length, 0);
  assert.equal(repository.creates.length, 1);
  assert.equal(repository.creates[0].created_by, "reader@shopify.com");
  assert.equal(repository.creates[0].watch, false);
});

test("refresh preserves omitted watch, creation fields, and optional source metadata", async () => {
  const repository = new FakePullRequestRepository([{
    id: "owned-record",
    repository: "SHOP/EXAMPLE",
    number: 42,
    created_by: "reader@shopify.com",
    watch: true,
    watch_updated_at: "2026-07-01T00:00:00.000Z",
    ts: 100,
    created_at: "2026-07-01T00:00:00.000Z",
    source_fetched_at: "2026-07-02T00:00:00.000Z",
    source_diff_truncated: true,
  }]);
  const publisher = new PullRequestStoryPublisher(repository, { now: fixedNow });

  const published = await publisher.publish(validStory(), "reader@shopify.com");

  assert.equal(published.action, "update");
  assert.equal(repository.creates.length, 0);
  assert.equal(repository.updates.length, 1);
  const fields = repository.updates[0].fields;
  assert.equal(fields.watch, true);
  assert.equal(fields.watch_updated_at, "2026-07-01T00:00:00.000Z");
  assert.equal(fields.ts, 100);
  assert.equal(fields.created_at, "2026-07-01T00:00:00.000Z");
  assert.equal(fields.updated_at, "2026-07-16T12:00:00.000Z");
  assert.equal(fields.source_fetched_at, "2026-07-02T00:00:00.000Z");
  assert.equal(fields.source_diff_truncated, true);
  assert.match(fields.search_text, /make retries visible/);
});

test("dry run predicts the action without creating or updating", async () => {
  const repository = new FakePullRequestRepository();
  const publisher = new PullRequestStoryPublisher(repository, { now: fixedNow });

  const published = await publisher.publish(validStory({ watch: true }), "reader@shopify.com", { dryRun: true });

  assert.equal(published.action, "create");
  assert.equal(published.fields.watch, true);
  assert.equal(repository.creates.length, 0);
  assert.equal(repository.updates.length, 0);
});

test("refuses to choose among duplicate records owned by the authenticated user", async () => {
  const repository = new FakePullRequestRepository([
    { id: "one", repository: "shop/example", number: 42, created_by: "reader@shopify.com" },
    { id: "two", repository: "SHOP/EXAMPLE", number: 42, created_by: "READER@shopify.com" },
  ]);
  const publisher = new PullRequestStoryPublisher(repository, { now: fixedNow });

  await assert.rejects(
    publisher.publish(validStory(), "reader@shopify.com"),
    (error) => error.code === "duplicate_owned_records",
  );
});
