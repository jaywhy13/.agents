import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { writeFileAtomically } from "../../src/storage/atomic-file-writer.ts";

const temporaryDirectories: string[] = [];

after(async () => {
  for (const directory of temporaryDirectories) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function emptyDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "teach-atomic-write-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("writeFileAtomically", () => {
  it("writes text a reader can read straight back", async () => {
    const directory = await emptyDirectory();
    const notesPath = path.join(directory, "notes.txt");

    await writeFileAtomically(notesPath, "what the lesson taught\n");

    assert.equal(await readFile(notesPath, "utf8"), "what the lesson taught\n");
  });

  it("writes bytes without turning them into text", async () => {
    const directory = await emptyDirectory();
    const imagePath = path.join(directory, "picture.png");
    const pngHeaderBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    await writeFileAtomically(imagePath, pngHeaderBytes);

    assert.deepEqual(new Uint8Array(await readFile(imagePath)), pngHeaderBytes);
  });

  it("replaces what was there before", async () => {
    const directory = await emptyDirectory();
    const notesPath = path.join(directory, "notes.txt");
    await writeFileAtomically(notesPath, "the first version");

    await writeFileAtomically(notesPath, "the second version");

    assert.equal(await readFile(notesPath, "utf8"), "the second version");
  });

  it("leaves no temporary file behind after a write that worked", async () => {
    const directory = await emptyDirectory();

    await writeFileAtomically(path.join(directory, "notes.txt"), "done");

    assert.deepEqual(await readdir(directory), ["notes.txt"]);
  });

  it("leaves no temporary file behind after a write that failed", async () => {
    const directory = await emptyDirectory();
    const pathInsideAMissingDirectory = path.join(directory, "not-there", "notes.txt");

    await assert.rejects(() => writeFileAtomically(pathInsideAMissingDirectory, "done"));

    assert.deepEqual(await readdir(directory), []);
  });

  it("leaves the old file alone when the new one cannot be written", async () => {
    const directory = await emptyDirectory();
    const notesPath = path.join(directory, "notes.txt");
    await writeFileAtomically(notesPath, "the version already there");
    const contentThatCannotBeWritten = { length: 1 } as unknown as string;

    await assert.rejects(() => writeFileAtomically(notesPath, contentThatCannotBeWritten));

    assert.equal(await readFile(notesPath, "utf8"), "the version already there");
    assert.deepEqual(await readdir(directory), ["notes.txt"]);
  });

  it("keeps two writers to the same path out of each other's temporary file", async () => {
    const directory = await emptyDirectory();
    const notesPath = path.join(directory, "notes.txt");

    await Promise.all([
      writeFileAtomically(notesPath, "one writer"),
      writeFileAtomically(notesPath, "another writer"),
    ]);

    assert.deepEqual(await readdir(directory), ["notes.txt"]);
    assert.match(await readFile(notesPath, "utf8"), /^(one|another) writer$/);
  });
});
