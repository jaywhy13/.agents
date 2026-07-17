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
    background: "## 🌍 Why retries were confusing\n\nThe old path created a second identity.",
    intuition: "## 🧭 Think of one journey with several attempts\n\nA retry is another attempt within the same journey.",
    code_story: "## 🪪 Carry attempt context\n\nThe implementation keeps every attempt tied to one operation.",
    code_samples: "## 🧪 Use the retry context\n\n`retry.js` · `createRetry`\n\n```diff\n-old\n+new\n```\n\n## 🧠 Check your understanding\n\n1. What stays stable?\n\n## ✅ Answers\n\n1. The identifier stays stable.",
    ...overrides,
  };
}

class FakePullRequestRepository {
  constructor(records = [], versions = []) {
    this.records = records;
    this.versions = versions;
    this.creates = [];
    this.updates = [];
    this.versionCreates = [];
    this.versionDeletes = [];
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

  async delete() {}

  async listVersions(pullRequestId, createdBy) {
    return this.versions.filter((version) => version.pull_request_id === pullRequestId && version.created_by === createdBy);
  }

  async createVersion(fields) {
    const version = { ...fields, id: `version-${this.versionCreates.length + 1}` };
    this.versionCreates.push(fields);
    this.versions.push(version);
    return { id: version.id };
  }

  async deleteVersion(id) {
    this.versionDeletes.push(id);
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
  assert.match(story.intuition, /same journey/);
  assert.match(story.code_samples, /Use the retry context/);
  assert.equal(story.source_fetched_at, "2026-07-15T14:34:54.985Z");
  assert.equal(story.source_diff_truncated, false);
});

test("requires intuition as independent Markdown with a heading", () => {
  assert.throws(
    () => validateStoryInput(validStory({ intuition: undefined })),
    (error) => error.issues.some((issue) => issue.field === "intuition" && issue.message === "must be a string"),
  );
  assert.throws(
    () => validateStoryInput(validStory({ intuition: "A retry is another attempt within the same journey." })),
    (error) => error.issues.some((issue) => issue.field === "intuition" && issue.message.includes("Markdown heading")),
  );
});

test("requires code samples as Markdown with a heading and fenced diff excerpt", () => {
  assert.throws(
    () => validateStoryInput(validStory({ code_samples: undefined })),
    (error) => error.issues.some((issue) => issue.field === "code_samples" && issue.message === "must be a string"),
  );
  assert.throws(
    () => validateStoryInput(validStory({ code_samples: "```diff\n-old\n+new\n```" })),
    (error) => error.issues.some((issue) => issue.field === "code_samples" && issue.message.includes("Markdown heading")),
  );
  assert.throws(
    () => validateStoryInput(validStory({ code_samples: "## Use the component\n\nNo source excerpt." })),
    (error) => error.issues.some((issue) => issue.field === "code_samples" && issue.message.includes("fenced diff excerpt")),
  );
});

test("rejects a static image without meaningful alt text", () => {
  assert.throws(
    () => validateStoryInput(validStory({ background: "## Flow\n\n![diagram](https://example.com/flow.png)" })),
    (error) => error.issues.some((issue) => issue.message.includes("meaningful alt text")),
  );
});

test("rejects an intuition image with an unsafe URL", () => {
  assert.throws(
    () => validateStoryInput(validStory({ intuition: "## Flow\n\n![Retry identity flow](javascript:alert(1))" })),
    (error) => error.issues.some((issue) => issue.field === "intuition" && issue.message.includes("safe HTTP(S) URL")),
  );
});

test("rejects raw HTML from every teaching field", () => {
  for (const field of ["background", "intuition", "code_story", "code_samples"]) {
    assert.throws(
      () => validateStoryInput(validStory({ [field]: "## Flow\n\n<details>hidden</details>" })),
      (error) => error.issues.some((issue) => issue.field === field && issue.message.includes("raw HTML")),
    );
  }
});

test("allows an accessible HTTP(S) image in intuition", () => {
  const story = validateStoryInput(validStory({
    intuition: "## Flow\n\n![A retry keeps the original operation identifier](https://organized.quick.shopify.io/files/retry-flow.png)",
  }));
  assert.match(story.intuition, /retry-flow\.png/);
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
  assert.equal(repository.creates[0].current_version_number, 1);
  assert.match(repository.creates[0].intuition, /same journey/);
  assert.match(repository.creates[0].code_samples, /Use the retry context/);
  assert.match(repository.creates[0].search_text, /same journey/);
  assert.match(repository.creates[0].search_text, /use the retry context/);
  assert.equal(repository.versionCreates.length, 1);
  assert.equal(repository.versionCreates[0].version_number, 1);
  assert.match(repository.versionCreates[0].intuition, /same journey/);
  assert.match(repository.versionCreates[0].code_samples, /Use the retry context/);
  assert.equal(repository.versionCreates[0].created_from, "agent_publish");
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
  assert.equal(fields.current_version_number, 2);
  assert.match(fields.intuition, /same journey/);
  assert.match(fields.search_text, /same journey/);
  assert.equal(repository.versionCreates.length, 2);
  assert.equal(repository.versionCreates[0].created_from, "legacy_migration");
  assert.equal(repository.versionCreates[0].code_samples, "");
  assert.equal(repository.versionCreates[1].version_number, 2);
  assert.match(repository.versionCreates[1].code_samples, /Use the retry context/);
});

test("dry run predicts the action without creating or updating", async () => {
  const repository = new FakePullRequestRepository();
  const publisher = new PullRequestStoryPublisher(repository, { now: fixedNow });

  const published = await publisher.publish(validStory({ watch: true }), "reader@shopify.com", { dryRun: true });

  assert.equal(published.action, "create");
  assert.equal(published.fields.watch, true);
  assert.equal(repository.creates.length, 0);
  assert.equal(repository.updates.length, 0);
  assert.equal(repository.versionCreates.length, 0);
});

test("identical content and watch do not create another version", async () => {
  const story = validStory();
  const existing = {
    id: "owned-record",
    ...story,
    created_by: "reader@shopify.com",
    watch: false,
    current_version_number: 1,
    ts: 100,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    watch_updated_at: "2026-07-01T00:00:00.000Z",
  };
  const repository = new FakePullRequestRepository([existing], [{
    id: "version-1",
    pull_request_id: existing.id,
    version_number: 1,
    ...story,
    created_by: "reader@shopify.com",
  }]);
  const publisher = new PullRequestStoryPublisher(repository, { now: fixedNow });

  const published = await publisher.publish(story, "reader@shopify.com");

  assert.equal(published.action, "no_change");
  assert.equal(published.version_created, false);
  assert.equal(repository.updates.length, 0);
  assert.equal(repository.versionCreates.length, 0);
});

test("changing code samples creates a new owner-scoped version and projection", async () => {
  const story = validStory();
  const existing = {
    id: "owned-record",
    ...story,
    created_by: "reader@shopify.com",
    watch: false,
    current_version_number: 1,
    ts: 100,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    watch_updated_at: "2026-07-01T00:00:00.000Z",
  };
  const repository = new FakePullRequestRepository([existing], [{
    id: "version-1",
    pull_request_id: existing.id,
    version_number: 1,
    ...story,
    created_by: "reader@shopify.com",
  }]);
  const publisher = new PullRequestStoryPublisher(repository, { now: fixedNow });
  const changedCodeSamples = "## 🧪 Call the retry service\n\n`retry.js` · `retryService.call`\n\n```diff\n-old\n+new\n```\n\n## 🧠 Check your understanding\n\n1. What calls the service?\n\n## ✅ Answers\n\n1. The retry coordinator.";

  const published = await publisher.publish(
    validStory({ code_samples: changedCodeSamples }),
    "reader@shopify.com",
  );

  assert.equal(published.action, "update");
  assert.equal(published.version_created, true);
  assert.equal(repository.updates[0].id, "owned-record");
  assert.equal(repository.updates[0].fields.code_samples, changedCodeSamples);
  assert.equal(repository.versionCreates[0].code_samples, changedCodeSamples);
  assert.equal(repository.versionCreates[0].created_by, "reader@shopify.com");
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
