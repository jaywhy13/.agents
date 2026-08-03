#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveQuickSoftwareDevelopmentKitPath } from "../../quick-runtime/resolve-quick-software-development-kit.mjs";

const SITE = "organized";
const COLLECTION = "pull_requests";
const INPUT_FIELDS = new Set([
  "title",
  "summary",
  "link",
  "repository",
  "number",
  "author",
  "background",
  "intuition",
  "code_story",
  "code_samples",
  "watch",
  "source_fetched_at",
  "source_diff_truncated",
]);
const MANAGED_FIELDS = new Set([
  "id",
  "created_by",
  "ts",
  "created_at",
  "updated_at",
  "watch_updated_at",
  "search_text",
]);

export class PublisherError extends Error {
  constructor(code, message, issues = undefined) {
    super(message);
    this.name = "PublisherError";
    this.code = code;
    this.issues = issues;
  }
}

function requiredString(input, field, issues, { singleLine = false } = {}) {
  if (typeof input[field] !== "string") {
    issues.push({ field, message: "must be a string" });
    return "";
  }
  const value = input[field].trim();
  if (!value) issues.push({ field, message: "must not be empty" });
  if (/\0/.test(value)) issues.push({ field, message: "must not contain null characters" });
  if (singleLine && /[\r\n]/.test(value)) issues.push({ field, message: "must be one line" });
  return value;
}

export function parseCanonicalPullRequestUrl(value) {
  if (typeof value !== "string") {
    throw new PublisherError("validation_failed", "The pull request story is invalid.", [
      { field: "link", message: "must be a string" },
    ]);
  }
  const link = value.trim();
  const match = link.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/([1-9]\d*)$/);
  if (!match) {
    throw new PublisherError("validation_failed", "The pull request story is invalid.", [
      {
        field: "link",
        message: "must be the canonical https://github.com/owner/repository/pull/number URL without a query, fragment, or trailing slash",
      },
    ]);
  }
  const number = Number(match[3]);
  if (!Number.isSafeInteger(number)) {
    throw new PublisherError("validation_failed", "The pull request story is invalid.", [
      { field: "link", message: "contains a pull request number outside JavaScript's safe integer range" },
    ]);
  }
  return {
    link,
    repository: `${match[1]}/${match[2]}`,
    number,
  };
}

function markdownOutsideCode(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "");
}

function markdownImages(markdown, field, issues) {
  const prose = markdownOutsideCode(markdown);
  const imageStartCount = (prose.match(/!\[/g) || []).length;
  const imagePattern = /!\[([^\]]*)\]\(([^)\n]+)\)/g;
  const matches = [...prose.matchAll(imagePattern)];
  if (matches.length !== imageStartCount) {
    issues.push({ field, message: "contains malformed Markdown image syntax" });
  }

  for (const match of matches) {
    const altText = match[1].trim();
    if (!altText || /^(image|diagram|graphic|photo|screenshot)$/i.test(altText)) {
      issues.push({ field, message: "each Markdown image must have meaningful alt text" });
    }

    const destination = match[2].trim();
    const angleBracketMatch = destination.match(/^<([^>]+)>(?:\s+["'][^"']*["'])?$/);
    const ordinaryMatch = destination.match(/^(\S+?)(?:\s+["'][^"']*["'])?$/);
    const urlText = angleBracketMatch?.[1] || ordinaryMatch?.[1];
    let url;
    try {
      url = new URL(urlText || "");
    } catch {
      issues.push({ field, message: `image URL is invalid: ${urlText || destination}` });
      continue;
    }
    if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
      issues.push({ field, message: `image URL must be a safe HTTP(S) URL without credentials: ${urlText}` });
    }
  }
}

function validateMarkdown(value, field, issues, { requireDiff = false } = {}) {
  const prose = markdownOutsideCode(value);
  if (value && !/^#{1,6}\s+\S/m.test(prose)) {
    issues.push({ field, message: "must contain at least one Markdown heading" });
  }
  if (/<\/?[A-Za-z][^>\n]*>/.test(prose)) {
    issues.push({ field, message: "must not contain raw HTML; use supported Markdown instead" });
  }
  if (requireDiff && value) {
    const excerpts = [...value.matchAll(/```diff[ \t]*\n([\s\S]*?)```/gi)];
    if (!excerpts.length || excerpts.some((match) => !match[1].trim())) {
      issues.push({ field, message: "must contain at least one non-empty fenced diff excerpt" });
    }
  }
  markdownImages(value, field, issues);
}

function optionalIsoTimestamp(input, field, issues) {
  if (!Object.hasOwn(input, field)) return undefined;
  if (typeof input[field] !== "string" || !input[field].trim()) {
    issues.push({ field, message: "must be a non-empty ISO 8601 timestamp string" });
    return undefined;
  }
  const timestamp = input[field].trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)) {
    issues.push({ field, message: "must use ISO 8601 date-time syntax" });
    return undefined;
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.valueOf())) {
    issues.push({ field, message: "must be a valid ISO 8601 timestamp" });
    return undefined;
  }
  return parsed.toISOString();
}

export function validateStoryInput(input) {
  if (!input || Array.isArray(input) || typeof input !== "object") {
    throw new PublisherError("validation_failed", "The input must be one JSON object.", [
      { field: "$", message: "must be an object" },
    ]);
  }

  const issues = [];
  for (const field of Object.keys(input)) {
    if (MANAGED_FIELDS.has(field)) {
      issues.push({ field, message: "is set automatically by the publisher and must be omitted" });
    } else if (!INPUT_FIELDS.has(field)) {
      issues.push({ field, message: "is not supported by the pull_requests schema" });
    }
  }

  const title = requiredString(input, "title", issues, { singleLine: true });
  const summary = requiredString(input, "summary", issues, { singleLine: true });
  const repository = requiredString(input, "repository", issues, { singleLine: true });
  const author = requiredString(input, "author", issues, { singleLine: true });
  const background = requiredString(input, "background", issues);
  const intuition = requiredString(input, "intuition", issues);
  const codeStory = requiredString(input, "code_story", issues);
  const codeSamples = requiredString(input, "code_samples", issues);

  let reference;
  try {
    reference = parseCanonicalPullRequestUrl(input.link);
  } catch (error) {
    issues.push(...(error.issues || [{ field: "link", message: error.message }]));
  }

  if (reference && repository.toLowerCase() !== reference.repository.toLowerCase()) {
    issues.push({ field: "repository", message: "must match the owner/repository in link" });
  }
  if (!Number.isSafeInteger(input.number) || input.number < 1) {
    issues.push({ field: "number", message: "must be a positive safe integer" });
  } else if (reference && input.number !== reference.number) {
    issues.push({ field: "number", message: "must match the pull request number in link" });
  }
  if (author && (author.startsWith("@") || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9]|[A-Za-z0-9-]{0,93}\[bot\])?$/.test(author))) {
    issues.push({ field: "author", message: "must be a GitHub username without a leading @" });
  }

  const watchProvided = Object.hasOwn(input, "watch");
  if (watchProvided && typeof input.watch !== "boolean") {
    issues.push({ field: "watch", message: "must be a boolean when provided" });
  }
  if (Object.hasOwn(input, "source_diff_truncated") && typeof input.source_diff_truncated !== "boolean") {
    issues.push({ field: "source_diff_truncated", message: "must be a boolean when provided" });
  }
  const sourceFetchedAt = optionalIsoTimestamp(input, "source_fetched_at", issues);

  validateMarkdown(background, "background", issues);
  validateMarkdown(intuition, "intuition", issues);
  validateMarkdown(codeStory, "code_story", issues);
  validateMarkdown(codeSamples, "code_samples", issues, { requireDiff: true });

  if (issues.length) {
    throw new PublisherError("validation_failed", "The pull request story is invalid.", issues);
  }

  return {
    title,
    summary,
    link: reference.link,
    repository: reference.repository,
    number: reference.number,
    author,
    background,
    intuition,
    code_story: codeStory,
    code_samples: codeSamples,
    watchProvided,
    ...(watchProvided ? { watch: input.watch } : {}),
    ...(sourceFetchedAt ? { source_fetched_at: sourceFetchedAt } : {}),
    ...(Object.hasOwn(input, "source_diff_truncated")
      ? { source_diff_truncated: input.source_diff_truncated }
      : {}),
  };
}

const VERSIONED_FIELDS = [
  "title",
  "summary",
  "author",
  "background",
  "intuition",
  "code_story",
  "code_samples",
  "source_fetched_at",
  "source_diff_truncated",
];

function versionContent(fields) {
  return {
    title: String(fields?.title || "").trim(),
    summary: String(fields?.summary || "").trim(),
    author: String(fields?.author || "").trim(),
    background: String(fields?.background || "").trim(),
    intuition: String(fields?.intuition || "").trim(),
    code_story: String(fields?.code_story || "").trim(),
    code_samples: String(fields?.code_samples || "").trim(),
    source_fetched_at: fields?.source_fetched_at ? String(fields.source_fetched_at) : null,
    source_diff_truncated: fields?.source_diff_truncated === true,
  };
}

function versionContentChanged(previousFields, nextFields) {
  const previous = versionContent(previousFields);
  const next = versionContent(nextFields);
  return VERSIONED_FIELDS.some((field) => previous[field] !== next[field]);
}

export function buildSearchText(pullRequest) {
  return [
    pullRequest.title,
    pullRequest.summary,
    pullRequest.link,
    pullRequest.repository,
    pullRequest.number,
    pullRequest.author,
    pullRequest.background,
    pullRequest.intuition,
    pullRequest.code_story,
    pullRequest.code_samples,
  ].join(" ").toLowerCase();
}

export class QuickPullRequestRepository {
  constructor(collection, versionCollection) {
    this.collection = collection;
    this.versionCollection = versionCollection;
  }

  async list(number) {
    const response = await this.collection.where({ number }).limit(500).find();
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.data)) return response.data;
    throw new PublisherError("database_response_invalid", "Quick returned an unreadable pull_requests query response.");
  }

  create(fields) {
    return this.collection.create(fields);
  }

  update(id, fields) {
    return this.collection.update(id, fields);
  }

  delete(id) {
    return this.collection.delete(id);
  }

  async listVersions(pullRequestId, createdBy) {
    const response = await this.versionCollection
      .where({ pull_request_id: pullRequestId, created_by: createdBy })
      .orderBy("version_number", "asc")
      .limit(500)
      .find();
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.data)) return response.data;
    throw new PublisherError("database_response_invalid", "Quick returned an unreadable pull_request_versions query response.");
  }

  createVersion(fields) {
    return this.versionCollection.create(fields);
  }

  deleteVersion(id) {
    return this.versionCollection.delete(id);
  }
}

function createdRecordId(response) {
  return Array.isArray(response) ? response[0]?.id : response?.id;
}

function sameOwner(record, createdBy) {
  return typeof record.created_by === "string" && record.created_by.toLowerCase() === createdBy.toLowerCase();
}

function sameRepository(record, repository) {
  return typeof record.repository === "string" && record.repository.toLowerCase() === repository.toLowerCase();
}

export class PullRequestStoryPublisher {
  constructor(repository, { now = () => new Date() } = {}) {
    this.repository = repository;
    this.now = now;
  }

  async publish(input, createdBy, { dryRun = false } = {}) {
    const story = validateStoryInput(input);
    const matches = (await this.repository.list(story.number)).filter((record) => sameRepository(record, story.repository));
    const ownedMatches = matches.filter((record) => sameOwner(record, createdBy));
    if (ownedMatches.length > 1) {
      throw new PublisherError(
        "duplicate_owned_records",
        `Found ${ownedMatches.length} pull_requests records owned by ${createdBy} for ${story.repository}#${story.number}; refusing to choose one.`,
      );
    }

    const existing = ownedMatches[0] || null;
    if (existing && typeof existing.id !== "string") {
      throw new PublisherError("database_response_invalid", "The matching Quick record has no string identifier.");
    }

    const now = this.now();
    const timestamp = now.valueOf();
    const isoTimestamp = now.toISOString();
    const watch = story.watchProvided ? story.watch : (existing?.watch ?? false);
    const watchChanged = !existing || existing.watch !== watch;
    const content = versionContent({
      ...story,
      source_fetched_at: story.source_fetched_at || existing?.source_fetched_at || null,
      source_diff_truncated: Object.hasOwn(story, "source_diff_truncated")
        ? story.source_diff_truncated
        : existing?.source_diff_truncated === true,
    });

    if (!existing) {
      const fields = {
        link: story.link,
        repository: story.repository,
        number: story.number,
        ...content,
        watch,
        current_version_number: 1,
        created_by: createdBy,
        ts: timestamp,
        created_at: isoTimestamp,
        updated_at: isoTimestamp,
        watch_updated_at: isoTimestamp,
      };
      fields.search_text = buildSearchText(fields);
      if (dryRun) return { action: "create", id: null, fields, version_number: 1, version_created: true };

      const created = await this.repository.create(fields);
      const id = createdRecordId(created);
      if (typeof id !== "string" || !id) {
        throw new PublisherError("database_response_invalid", "Quick created the record but returned no string identifier.");
      }
      const versionFields = {
        pull_request_id: id,
        version_number: 1,
        ...content,
        created_by: createdBy,
        created_from: "agent_publish",
        ts: timestamp,
        created_at: isoTimestamp,
      };
      try {
        const createdVersion = await this.repository.createVersion(versionFields);
        if (!createdRecordId(createdVersion)) throw new Error("Quick returned no version identifier.");
      } catch (error) {
        await this.repository.delete(id);
        throw new PublisherError("version_create_failed", `The parent was rolled back because version 1 could not be created: ${error.message}`);
      }
      return { action: "create", id, fields, version_number: 1, version_created: true };
    }

    let versions = await this.repository.listVersions(existing.id, createdBy);
    let migratedLegacyVersion = false;
    if (!versions.length) {
      const legacyFields = {
        pull_request_id: existing.id,
        version_number: 1,
        ...versionContent(existing),
        created_by: createdBy,
        created_from: "legacy_migration",
        ts: existing.ts || Date.parse(existing.created_at) || timestamp,
        created_at: existing.created_at || isoTimestamp,
      };
      if (!dryRun) {
        const createdLegacyVersion = await this.repository.createVersion(legacyFields);
        const legacyId = createdRecordId(createdLegacyVersion);
        if (!legacyId) throw new PublisherError("version_create_failed", "Quick created legacy version 1 but returned no identifier.");
        versions = [{ ...legacyFields, id: legacyId }];
      } else {
        versions = [{ ...legacyFields, id: "[legacy-version-1]" }];
      }
      migratedLegacyVersion = true;
    }

    const currentVersionNumber = Math.max(...versions.map((version) => Number(version.version_number) || 1));
    const contentChanged = versionContentChanged(existing, content);
    const nextVersionNumber = contentChanged ? currentVersionNumber + 1 : currentVersionNumber;
    const fields = {
      link: existing.link,
      repository: existing.repository,
      number: existing.number,
      ...content,
      watch,
      current_version_number: nextVersionNumber,
      created_by: createdBy,
      ts: existing.ts,
      created_at: existing.created_at,
      updated_at: contentChanged || watchChanged ? isoTimestamp : existing.updated_at,
      watch_updated_at: watchChanged ? isoTimestamp : (existing.watch_updated_at || isoTimestamp),
    };
    fields.search_text = buildSearchText(fields);
    const action = contentChanged || watchChanged || migratedLegacyVersion ? "update" : "no_change";
    if (dryRun) return { action, id: existing.id, fields, version_number: nextVersionNumber, version_created: contentChanged };

    let createdVersionId = null;
    if (contentChanged) {
      const versionFields = {
        pull_request_id: existing.id,
        version_number: nextVersionNumber,
        ...content,
        created_by: createdBy,
        created_from: "agent_publish",
        ts: timestamp,
        created_at: isoTimestamp,
      };
      const createdVersion = await this.repository.createVersion(versionFields);
      createdVersionId = createdRecordId(createdVersion);
      if (!createdVersionId) throw new PublisherError("version_create_failed", `Quick created version ${nextVersionNumber} but returned no identifier.`);
    }

    if (action !== "no_change") {
      try {
        await this.repository.update(existing.id, fields);
      } catch (error) {
        if (createdVersionId) await this.repository.deleteVersion(createdVersionId);
        throw error;
      }
    }
    return { action, id: existing.id, fields, version_number: nextVersionNumber, version_created: contentChanged };
  }
}

function parseArguments(argumentsList) {
  const dryRun = argumentsList.includes("--dry-run");
  const positionals = argumentsList.filter((argument) => argument !== "--dry-run");
  if (positionals.length !== 1) {
    throw new PublisherError(
      "usage_error",
      "Usage: node publish-pr-story.mjs [--dry-run] <pull-request-story.json>",
    );
  }
  return { dryRun, inputPath: positionals[0] };
}

async function authenticatedQuickClient() {
  let softwareDevelopmentKitPath;
  try {
    softwareDevelopmentKitPath = resolveQuickSoftwareDevelopmentKitPath();
  } catch (error) {
    throw new PublisherError("quick_unavailable", error.message);
  }
  const { createClient } = await import(pathToFileURL(softwareDevelopmentKitPath).href);
  const client = createClient(SITE);
  const user = await client.id.waitForUser();
  const createdBy = user?.email?.trim().toLowerCase();
  if (!createdBy) {
    throw new PublisherError("authentication_failed", "Could not resolve the authenticated email. Run `quick auth login` and try again.");
  }
  return { client, createdBy };
}

export async function run(argumentsList = process.argv.slice(2)) {
  const { dryRun, inputPath } = parseArguments(argumentsList);
  let input;
  try {
    input = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
  } catch (error) {
    throw new PublisherError("input_unreadable", `Could not read valid JSON from ${inputPath}: ${error.message}`);
  }

  validateStoryInput(input);
  const { client, createdBy } = await authenticatedQuickClient();
  const repository = new QuickPullRequestRepository(
    client.db.collection(COLLECTION),
    client.db.collection("pull_request_versions"),
  );
  const publisher = new PullRequestStoryPublisher(repository);
  const published = await publisher.publish(input, createdBy, { dryRun });
  const detailUrl = published.id
    ? `https://${SITE}.quick.shopify.io/pull-request/?id=${encodeURIComponent(published.id)}`
    : `https://${SITE}.quick.shopify.io/pull-requests/`;
  return {
    ok: true,
    dry_run: dryRun,
    action: published.action,
    id: published.id || null,
    site: SITE,
    collection: COLLECTION,
    url: detailUrl,
    version_number: published.version_number,
    version_created: published.version_created,
    pull_request: {
      repository: published.fields.repository,
      number: published.fields.number,
      link: published.fields.link,
      created_by: published.fields.created_by,
      watch: published.fields.watch,
      created_at: published.fields.created_at,
      updated_at: published.fields.updated_at,
    },
  };
}

async function main() {
  try {
    console.log(JSON.stringify(await run(), null, 2));
  } catch (error) {
    const publisherError = error instanceof PublisherError
      ? error
      : new PublisherError("publish_failed", error?.message || String(error));
    console.error(JSON.stringify({
      ok: false,
      error: {
        code: publisherError.code,
        message: publisherError.message,
        ...(publisherError.issues ? { issues: publisherError.issues } : {}),
      },
    }, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
