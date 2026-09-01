/**
 * Stores generated images beside the lesson they belong to.
 *
 * ```
 * ~/.pi/agent/teach/lessons/<lesson-id>/images/
 * ├── <illustration-id>.png    # the bytes
 * └── <illustration-id>.json   # what was asked for, so a cache hit can be explained
 * ```
 *
 * The file name is the content hash of the request, which is what makes this a
 * cache: asking for the same picture twice finds the first one already there. An
 * image costs money and seconds to make, and a lesson revisits the same idea often.
 *
 * This is a repository, so it does plain create and read against optional filters
 * and knows nothing about why an image is wanted.
 */

import { Buffer } from "node:buffer";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { writeFileAtomically } from "../storage/atomic-file-writer.ts";

const IMAGES_DIRECTORY_NAME = "images";
const LESSON_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const ILLUSTRATION_ID_PATTERN = /^[a-f0-9]{64}$/;

export class InvalidLessonImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidLessonImageError";
  }
}

export interface StoredIllustration {
  readonly illustrationId: string;
  readonly imagePath: string;
  readonly byteCount: number;
  readonly prompt: string;
  readonly size: string;
  readonly style: string;
  readonly model: string;
  readonly createdAt: string;
}

export interface NewIllustration {
  readonly illustrationId: string;
  readonly bytes: Uint8Array;
  readonly prompt: string;
  readonly size: string;
  readonly style: string;
  readonly model: string;
  readonly createdAt: string;
}

export class LessonImageRepository {
  private readonly lessonsDirectory: string;

  constructor(lessonsDirectory: string) {
    this.lessonsDirectory = lessonsDirectory;
  }

  /** Returns nothing when this lesson has no image under that id yet. */
  async get(lessonId: string, illustrationId: string): Promise<StoredIllustration | null> {
    const imagePath = this.imagePath(lessonId, illustrationId);

    let sidecarContent: string;
    try {
      sidecarContent = await readFile(this.sidecarPath(lessonId, illustrationId), "utf8");
    } catch {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(sidecarContent);
    } catch (cause) {
      throw new InvalidLessonImageError(
        `Image ${illustrationId} in lesson ${lessonId} has a record that is not JSON: ${describeCause(cause)}`,
      );
    }

    return { ...parseStoredIllustration(parsed, lessonId, illustrationId), imagePath };
  }

  async readBytes(lessonId: string, illustrationId: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.imagePath(lessonId, illustrationId)));
    } catch {
      return null;
    }
  }

  /**
   * Writes the bytes first and the record second. A reader looks for the record, so
   * an interrupted write leaves an orphan image rather than a record pointing at
   * bytes that are not there.
   */
  async create(lessonId: string, illustration: NewIllustration): Promise<StoredIllustration> {
    const imagesDirectory = this.imagesDirectory(lessonId);
    await mkdir(imagesDirectory, { recursive: true });

    const imagePath = this.imagePath(lessonId, illustration.illustrationId);
    await writeFileAtomically(imagePath, illustration.bytes);

    const stored: StoredIllustration = {
      illustrationId: illustration.illustrationId,
      imagePath,
      byteCount: illustration.bytes.byteLength,
      prompt: illustration.prompt,
      size: illustration.size,
      style: illustration.style,
      model: illustration.model,
      createdAt: illustration.createdAt,
    };

    // The path is where the record was found, so it is derived on read rather than
    // stored: a lessons directory that moves must not leave stale paths behind.
    const { imagePath: pathIsDerivedOnRead, ...recordToStore } = stored;
    void pathIsDerivedOnRead;
    await writeFileAtomically(
      this.sidecarPath(lessonId, illustration.illustrationId),
      Buffer.from(`${JSON.stringify(recordToStore, null, 2)}\n`, "utf8"),
    );

    return stored;
  }

  async delete(lessonId: string, illustrationId: string): Promise<void> {
    await rm(this.sidecarPath(lessonId, illustrationId), { force: true });
    await rm(this.imagePath(lessonId, illustrationId), { force: true });
  }

  private imagesDirectory(lessonId: string): string {
    return path.join(this.lessonsDirectory, requireLessonId(lessonId), IMAGES_DIRECTORY_NAME);
  }

  private imagePath(lessonId: string, illustrationId: string): string {
    return path.join(this.imagesDirectory(lessonId), `${requireIllustrationId(illustrationId)}.png`);
  }

  private sidecarPath(lessonId: string, illustrationId: string): string {
    return path.join(
      this.imagesDirectory(lessonId),
      `${requireIllustrationId(illustrationId)}.json`,
    );
  }
}

/**
 * Both ids become path segments, so both are checked against a fixed alphabet
 * before they are joined to a directory. A hash is hex and a lesson id is a slug;
 * neither can hold a separator or a `..`.
 */
function requireLessonId(lessonId: string): string {
  if (!LESSON_ID_PATTERN.test(lessonId)) {
    throw new InvalidLessonImageError(`Lesson id "${lessonId}" is not a lesson id.`);
  }
  return lessonId;
}

function requireIllustrationId(illustrationId: string): string {
  if (!ILLUSTRATION_ID_PATTERN.test(illustrationId)) {
    throw new InvalidLessonImageError(
      `Illustration id "${illustrationId}" is not a 64 character hex content hash.`,
    );
  }
  return illustrationId;
}

function parseStoredIllustration(
  parsed: unknown,
  lessonId: string,
  illustrationId: string,
): Omit<StoredIllustration, "imagePath"> {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new InvalidLessonImageError(
      `Image ${illustrationId} in lesson ${lessonId} has a record that is not an object.`,
    );
  }
  const record = parsed as Record<string, unknown>;

  return {
    illustrationId: requireText(record["illustrationId"], "illustrationId", illustrationId),
    byteCount: requireWholeNumber(record["byteCount"], "byteCount", illustrationId),
    prompt: requireText(record["prompt"], "prompt", illustrationId),
    size: requireText(record["size"], "size", illustrationId),
    style: requireText(record["style"], "style", illustrationId),
    model: requireText(record["model"], "model", illustrationId),
    createdAt: requireText(record["createdAt"], "createdAt", illustrationId),
  };
}

function requireText(value: unknown, fieldName: string, illustrationId: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new InvalidLessonImageError(
      `Image ${illustrationId} has a record with no ${fieldName}.`,
    );
  }
  return value;
}

function requireWholeNumber(value: unknown, fieldName: string, illustrationId: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new InvalidLessonImageError(
      `Image ${illustrationId} has a record with no ${fieldName}.`,
    );
  }
  return value;
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
