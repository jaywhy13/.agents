import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAXIMUM_EXCERPT_LINES } from "../../src/references/reference-excerpt.ts";
import {
  ReferenceLibraryService,
  ReferenceNotFoundError,
} from "../../src/references/reference-library-service.ts";
import { FileSystemReferenceRepository } from "../../src/references/reference-repository.ts";
import { emptyLessonsDirectory, storedReference } from "./support/reference-factories.ts";

interface TestBench {
  readonly referenceLibraryService: ReferenceLibraryService;
  readonly referenceRepository: FileSystemReferenceRepository;
}

async function testBench(): Promise<TestBench> {
  const referenceRepository = new FileSystemReferenceRepository(await emptyLessonsDirectory());
  return {
    referenceRepository,
    referenceLibraryService: new ReferenceLibraryService({ referenceRepository }),
  };
}

function numberedLines(lineCount: number): string {
  const lines: string[] = [];
  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
    lines.push(`line ${lineNumber}`);
  }
  return lines.join("\n");
}

describe("ReferenceLibraryService.readExcerpt", () => {
  it("reads a window of the reference instead of all of it", async () => {
    const bench = await testBench();
    await bench.referenceRepository.create(storedReference(), numberedLines(100));

    const excerpt = await bench.referenceLibraryService.readExcerpt(
      "lesson-abc123",
      "reference-aaaa1111",
      { offset: 2, limit: 3 },
    );

    assert.equal(excerpt.text, "line 2\nline 3\nline 4");
  });

  it("says where the next read should start", async () => {
    const bench = await testBench();
    await bench.referenceRepository.create(storedReference(), numberedLines(100));

    const excerpt = await bench.referenceLibraryService.readExcerpt(
      "lesson-abc123",
      "reference-aaaa1111",
      { limit: 10 },
    );

    assert.equal(excerpt.nextLineNumber, 11);
  });

  it("never hands back more than the line limit for a large reference", async () => {
    const bench = await testBench();
    await bench.referenceRepository.create(
      storedReference(),
      numberedLines(MAXIMUM_EXCERPT_LINES + 500),
    );

    const excerpt = await bench.referenceLibraryService.readExcerpt(
      "lesson-abc123",
      "reference-aaaa1111",
    );

    assert.equal(excerpt.lineCount, MAXIMUM_EXCERPT_LINES);
    assert.equal(excerpt.truncated, true);
  });

  it("says how big the whole reference is so a reader can plan", async () => {
    const bench = await testBench();
    await bench.referenceRepository.create(storedReference(), numberedLines(50));

    const excerpt = await bench.referenceLibraryService.readExcerpt(
      "lesson-abc123",
      "reference-aaaa1111",
      { limit: 5 },
    );

    assert.equal(excerpt.totalLineCount, 50);
  });

  it("carries the label and the source address with the window", async () => {
    const bench = await testBench();
    await bench.referenceRepository.create(
      storedReference({ label: "Queue docs", sourceUrl: "https://example.com/queues" }),
      "A queue keeps order.",
    );

    const excerpt = await bench.referenceLibraryService.readExcerpt(
      "lesson-abc123",
      "reference-aaaa1111",
    );

    assert.equal(excerpt.label, "Queue docs");
    assert.equal(excerpt.sourceUrl, "https://example.com/queues");
  });

  it("reports a reference that is not there", async () => {
    const bench = await testBench();

    await assert.rejects(
      bench.referenceLibraryService.readExcerpt("lesson-abc123", "reference-missing"),
      ReferenceNotFoundError,
    );
  });
});

describe("ReferenceLibraryService.list", () => {
  it("lists the references of one lesson", async () => {
    const bench = await testBench();
    await bench.referenceRepository.create(storedReference({ label: "Queue docs" }), "text");

    const references = await bench.referenceLibraryService.list("lesson-abc123");

    assert.deepEqual(
      references.map((reference) => reference.label),
      ["Queue docs"],
    );
  });
});
