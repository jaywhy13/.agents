import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import type { NewIllustration } from "../../src/visuals/lesson-image-repository.ts";
import {
  InvalidLessonImageError,
  LessonImageRepository,
} from "../../src/visuals/lesson-image-repository.ts";
import { SMALLEST_VALID_PNG_BYTES } from "./support/fake-image-generation-proxy.ts";

const AN_ILLUSTRATION_ID = "a".repeat(64);
const ANOTHER_ILLUSTRATION_ID = "b".repeat(64);

async function emptyLessonsDirectory(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "teach-lesson-images-"));
}

function newIllustration(overrides: Partial<NewIllustration> = {}): NewIllustration {
  return {
    illustrationId: AN_ILLUSTRATION_ID,
    bytes: SMALLEST_VALID_PNG_BYTES,
    prompt: "A message queue between a producer and a consumer",
    size: "1024x1024",
    style: "diagram_sketch",
    model: "gpt-image-1.5",
    createdAt: "2024-05-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("storing a lesson image", () => {
  it("reads back an image it stored", async () => {
    const repository = new LessonImageRepository(await emptyLessonsDirectory());

    await repository.create("lesson-abc123", newIllustration());

    const stored = await repository.get("lesson-abc123", AN_ILLUSTRATION_ID);
    assert.equal(stored?.illustrationId, AN_ILLUSTRATION_ID);
  });

  it("reads back the bytes it stored", async () => {
    const repository = new LessonImageRepository(await emptyLessonsDirectory());
    await repository.create("lesson-abc123", newIllustration());

    const bytes = await repository.readBytes("lesson-abc123", AN_ILLUSTRATION_ID);

    assert.deepEqual(bytes, SMALLEST_VALID_PNG_BYTES);
  });

  it("keeps what was asked for, so a cache hit can be explained", async () => {
    const repository = new LessonImageRepository(await emptyLessonsDirectory());

    await repository.create("lesson-abc123", newIllustration({ style: "photograph" }));

    assert.equal((await repository.get("lesson-abc123", AN_ILLUSTRATION_ID))?.style, "photograph");
  });

  it("records how many bytes the image is", async () => {
    const repository = new LessonImageRepository(await emptyLessonsDirectory());

    await repository.create("lesson-abc123", newIllustration());

    assert.equal(
      (await repository.get("lesson-abc123", AN_ILLUSTRATION_ID))?.byteCount,
      SMALLEST_VALID_PNG_BYTES.byteLength,
    );
  });

  it("puts the image under the lesson it belongs to", async () => {
    const lessonsDirectory = await emptyLessonsDirectory();
    const repository = new LessonImageRepository(lessonsDirectory);

    await repository.create("lesson-abc123", newIllustration());

    const imageFiles = await readdir(path.join(lessonsDirectory, "lesson-abc123", "images"));
    assert.ok(imageFiles.includes(`${AN_ILLUSTRATION_ID}.png`));
  });

  it("keeps one lesson's images out of another lesson's directory", async () => {
    const repository = new LessonImageRepository(await emptyLessonsDirectory());
    await repository.create("lesson-one", newIllustration());

    assert.equal(await repository.get("lesson-two", AN_ILLUSTRATION_ID), null);
  });

  it("leaves no partly written file behind", async () => {
    const lessonsDirectory = await emptyLessonsDirectory();
    const repository = new LessonImageRepository(lessonsDirectory);

    await repository.create("lesson-abc123", newIllustration());

    const imageFiles = await readdir(path.join(lessonsDirectory, "lesson-abc123", "images"));
    assert.deepEqual(
      imageFiles.filter((fileName) => fileName.endsWith(".tmp")),
      [],
    );
  });
});

describe("reading a lesson image that is not there", () => {
  it("returns nothing for an image that was never stored", async () => {
    const repository = new LessonImageRepository(await emptyLessonsDirectory());

    assert.equal(await repository.get("lesson-abc123", ANOTHER_ILLUSTRATION_ID), null);
  });

  it("returns no bytes for an image that was never stored", async () => {
    const repository = new LessonImageRepository(await emptyLessonsDirectory());

    assert.equal(await repository.readBytes("lesson-abc123", ANOTHER_ILLUSTRATION_ID), null);
  });

  it("names the image when its record is not JSON", async () => {
    const lessonsDirectory = await emptyLessonsDirectory();
    const repository = new LessonImageRepository(lessonsDirectory);
    await repository.create("lesson-abc123", newIllustration());
    await writeFile(
      path.join(lessonsDirectory, "lesson-abc123", "images", `${AN_ILLUSTRATION_ID}.json`),
      "{ not json",
    );

    await assert.rejects(
      () => repository.get("lesson-abc123", AN_ILLUSTRATION_ID),
      InvalidLessonImageError,
    );
  });
});

describe("refusing an id that could reach outside the lesson", () => {
  it("refuses a lesson id that would climb out of the lessons directory", async () => {
    const repository = new LessonImageRepository(await emptyLessonsDirectory());

    await assert.rejects(
      () => repository.get("../../../etc", AN_ILLUSTRATION_ID),
      InvalidLessonImageError,
    );
  });

  it("refuses an illustration id that is not a content hash", async () => {
    const repository = new LessonImageRepository(await emptyLessonsDirectory());

    await assert.rejects(
      () => repository.get("lesson-abc123", "../../secrets"),
      InvalidLessonImageError,
    );
  });
});

describe("removing a lesson image", () => {
  it("forgets an image that was deleted", async () => {
    const repository = new LessonImageRepository(await emptyLessonsDirectory());
    await repository.create("lesson-abc123", newIllustration());

    await repository.delete("lesson-abc123", AN_ILLUSTRATION_ID);

    assert.equal(await repository.get("lesson-abc123", AN_ILLUSTRATION_ID), null);
  });

  it("says nothing about an image that was never there", async () => {
    const repository = new LessonImageRepository(await emptyLessonsDirectory());

    await repository.delete("lesson-abc123", AN_ILLUSTRATION_ID);
  });
});

describe("what ends up on disk", () => {
  it("writes the record as readable JSON, so a person can inspect the cache", async () => {
    const lessonsDirectory = await emptyLessonsDirectory();
    const repository = new LessonImageRepository(lessonsDirectory);

    await repository.create("lesson-abc123", newIllustration());

    const recordContent = await readFile(
      path.join(lessonsDirectory, "lesson-abc123", "images", `${AN_ILLUSTRATION_ID}.json`),
      "utf8",
    );
    assert.equal(JSON.parse(recordContent).model, "gpt-image-1.5");
  });
});
