import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import { InvalidReferenceError } from "../../src/references/reference.ts";
import {
  FileSystemReferenceRepository,
  REFERENCES_DIRECTORY_NAME,
} from "../../src/references/reference-repository.ts";
import { emptyLessonsDirectory, storedReference } from "./support/reference-factories.ts";

describe("FileSystemReferenceRepository", () => {
  it("keeps a copy of the content on disk under the lesson", async () => {
    const lessonsDirectory = await emptyLessonsDirectory();
    const repository = new FileSystemReferenceRepository(lessonsDirectory);
    const reference = storedReference();

    await repository.create(reference, "A queue keeps order.");

    const contentPath = path.join(
      lessonsDirectory,
      reference.lessonId,
      REFERENCES_DIRECTORY_NAME,
      reference.contentFileName,
    );
    assert.equal(await readFile(contentPath, "utf8"), "A queue keeps order.");
  });

  it("reads the content back", async () => {
    const lessonsDirectory = await emptyLessonsDirectory();
    const repository = new FileSystemReferenceRepository(lessonsDirectory);
    const reference = storedReference();
    await repository.create(reference, "A queue keeps order.");

    const content = await repository.readContent(reference.lessonId, reference.referenceId);

    assert.equal(content, "A queue keeps order.");
  });

  it("reads the metadata back as a value object", async () => {
    const lessonsDirectory = await emptyLessonsDirectory();
    const repository = new FileSystemReferenceRepository(lessonsDirectory);
    const reference = storedReference({ title: "How queues work" });
    await repository.create(reference, "text");

    const readBack = await repository.get(reference.lessonId, reference.referenceId);

    assert.deepEqual(readBack, reference);
  });

  it("lists every reference of one lesson in the order they were copied", async () => {
    const lessonsDirectory = await emptyLessonsDirectory();
    const repository = new FileSystemReferenceRepository(lessonsDirectory);
    const firstCopied = storedReference({
      referenceId: "reference-0001",
      copiedAt: "2024-05-01T10:00:00.000Z",
      contentFileName: "reference-0001.txt",
    });
    const secondCopied = storedReference({
      referenceId: "reference-0002",
      copiedAt: "2024-05-01T10:05:00.000Z",
      contentFileName: "reference-0002.txt",
    });
    await repository.create(secondCopied, "second");
    await repository.create(firstCopied, "first");

    const references = await repository.list("lesson-abc123");

    assert.deepEqual(
      references.map((reference) => reference.referenceId),
      ["reference-0001", "reference-0002"],
    );
  });

  it("does not list references belonging to another lesson", async () => {
    const lessonsDirectory = await emptyLessonsDirectory();
    const repository = new FileSystemReferenceRepository(lessonsDirectory);
    await repository.create(storedReference({ lessonId: "lesson-other" }), "text");

    assert.deepEqual(await repository.list("lesson-abc123"), []);
  });

  it("has no references for a lesson that was never given any", async () => {
    const repository = new FileSystemReferenceRepository(await emptyLessonsDirectory());

    assert.deepEqual(await repository.list("lesson-abc123"), []);
  });

  it("returns null for a reference that is not there", async () => {
    const repository = new FileSystemReferenceRepository(await emptyLessonsDirectory());

    assert.equal(await repository.get("lesson-abc123", "reference-missing"), null);
  });

  it("removes both the metadata and the copied content", async () => {
    const lessonsDirectory = await emptyLessonsDirectory();
    const repository = new FileSystemReferenceRepository(lessonsDirectory);
    const reference = storedReference();
    await repository.create(reference, "text");

    await repository.delete(reference.lessonId, reference.referenceId);

    assert.equal(await repository.get(reference.lessonId, reference.referenceId), null);
    assert.equal(await repository.readContent(reference.lessonId, reference.referenceId), null);
  });

  it("refuses a reference id that would climb out of the lesson directory", async () => {
    const repository = new FileSystemReferenceRepository(await emptyLessonsDirectory());

    await assert.rejects(
      repository.readContent("lesson-abc123", "../../etc/passwd"),
      InvalidReferenceError,
    );
  });

  it("reports metadata that is not readable rather than returning half a reference", async () => {
    const lessonsDirectory = await emptyLessonsDirectory();
    const repository = new FileSystemReferenceRepository(lessonsDirectory);
    const reference = storedReference();
    await repository.create(reference, "text");
    const metadataPath = path.join(
      lessonsDirectory,
      reference.lessonId,
      REFERENCES_DIRECTORY_NAME,
      `${reference.referenceId}.json`,
    );
    await writeFile(metadataPath, "{ not json", "utf8");

    await assert.rejects(
      repository.get(reference.lessonId, reference.referenceId),
      InvalidReferenceError,
    );
  });
});
