import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { isReferenceKind, requireLessonId } from "../../shared/lesson.ts";
import { writeFileAtomically } from "../storage/atomic-file-writer.ts";
import type { StoredReference } from "./reference.ts";
import { InvalidReferenceError, requireReferenceId } from "./reference.ts";

export const REFERENCES_DIRECTORY_NAME = "references";
const METADATA_FILE_SUFFIX = ".json";
const CONTENT_FILE_SUFFIX = ".txt";

/**
 * Where copied references live. The service owns this interface, so a test can put
 * references in memory and the lesson can put them on the learner's disk without
 * either one knowing about the other.
 */
export interface ReferenceRepository {
  create(reference: StoredReference, content: string): Promise<StoredReference>;
  list(lessonId: string): Promise<readonly StoredReference[]>;
  get(lessonId: string, referenceId: string): Promise<StoredReference | null>;
  readContent(lessonId: string, referenceId: string): Promise<string | null>;
  delete(lessonId: string, referenceId: string): Promise<void>;
}

/**
 * Keeps a copy of every reference on the learner's own machine, under the lesson
 * it belongs to.
 *
 * A copy, not a link. A lesson has to be able to quote and re-read its evidence
 * long after the page it came from changed, moved or went away, and while the
 * learner is offline. The remote address is kept as well, but only as a note of
 * where the copy came from.
 */
export class FileSystemReferenceRepository implements ReferenceRepository {
  private readonly lessonsDirectory: string;

  constructor(lessonsDirectory: string) {
    this.lessonsDirectory = lessonsDirectory;
  }

  async create(reference: StoredReference, content: string): Promise<StoredReference> {
    const directory = this.referencesDirectory(reference.lessonId);
    await mkdir(directory, { recursive: true });

    const referenceId = requireReferenceId(reference.referenceId);
    await writeFileAtomically(path.join(directory, contentFileName(referenceId)), content);
    await writeFileAtomically(
      path.join(directory, `${referenceId}${METADATA_FILE_SUFFIX}`),
      `${JSON.stringify(reference, null, 2)}\n`,
    );
    return reference;
  }

  async list(lessonId: string): Promise<readonly StoredReference[]> {
    let entries: string[];
    try {
      entries = await readdir(this.referencesDirectory(lessonId));
    } catch {
      return [];
    }

    const references: StoredReference[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(METADATA_FILE_SUFFIX)) {
        continue;
      }
      const reference = await this.get(lessonId, entry.slice(0, -METADATA_FILE_SUFFIX.length));
      if (reference !== null) {
        references.push(reference);
      }
    }
    return references.sort(byCopiedAtThenId);
  }

  async get(lessonId: string, referenceId: string): Promise<StoredReference | null> {
    const metadataPath = path.join(
      this.referencesDirectory(lessonId),
      `${requireReferenceId(referenceId)}${METADATA_FILE_SUFFIX}`,
    );

    let content: string;
    try {
      content = await readFile(metadataPath, "utf8");
    } catch {
      return null;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content);
    } catch (cause) {
      throw new InvalidReferenceError(
        `Reference ${referenceId} has metadata that is not JSON: ${describeCause(cause)}`,
      );
    }
    return parseStoredReference(parsedJson);
  }

  async readContent(lessonId: string, referenceId: string): Promise<string | null> {
    const contentPath = path.join(
      this.referencesDirectory(lessonId),
      contentFileName(requireReferenceId(referenceId)),
    );
    try {
      return await readFile(contentPath, "utf8");
    } catch {
      return null;
    }
  }

  async delete(lessonId: string, referenceId: string): Promise<void> {
    const directory = this.referencesDirectory(lessonId);
    const checkedReferenceId = requireReferenceId(referenceId);
    await rm(path.join(directory, `${checkedReferenceId}${METADATA_FILE_SUFFIX}`), { force: true });
    await rm(path.join(directory, contentFileName(checkedReferenceId)), { force: true });
  }

  private referencesDirectory(lessonId: string): string {
    return path.join(this.lessonsDirectory, requireLessonId(lessonId), REFERENCES_DIRECTORY_NAME);
  }
}

export function contentFileName(referenceId: string): string {
  return `${referenceId}${CONTENT_FILE_SUFFIX}`;
}

export function parseStoredReference(candidate: unknown): StoredReference {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new InvalidReferenceError("Reference metadata must be an object.");
  }
  const record = candidate as Record<string, unknown>;

  const kind = record["kind"];
  if (!isReferenceKind(kind)) {
    throw new InvalidReferenceError(`Unknown reference kind: ${String(kind)}`);
  }

  return {
    referenceId: requireReferenceId(record["referenceId"]),
    lessonId: requireLessonId(record["lessonId"]),
    kind,
    label: requireText(record["label"], "label"),
    sourceUrl: optionalText(record["sourceUrl"], "sourceUrl"),
    title: optionalText(record["title"], "title"),
    mediaType: requireText(record["mediaType"], "mediaType"),
    byteLength: requireCount(record["byteLength"], "byteLength"),
    lineCount: requireCount(record["lineCount"], "lineCount"),
    copiedAt: requireText(record["copiedAt"], "copiedAt"),
    contentFileName: requireText(record["contentFileName"], "contentFileName"),
  };
}

function byCopiedAtThenId(left: StoredReference, right: StoredReference): number {
  if (left.copiedAt !== right.copiedAt) {
    return left.copiedAt < right.copiedAt ? -1 : 1;
  }
  return left.referenceId < right.referenceId ? -1 : 1;
}

function requireText(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidReferenceError(`Field ${fieldName} must be non-blank text.`);
  }
  return value;
}

function optionalText(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new InvalidReferenceError(`Field ${fieldName} must be text or null.`);
  }
  return value;
}

function requireCount(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new InvalidReferenceError(`Field ${fieldName} must be an integer of 0 or more.`);
  }
  return value;
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
