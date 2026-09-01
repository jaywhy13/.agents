import assert from "node:assert/strict";
import { readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  createTeachingScratchDirectory,
  removeTeachingScratchDirectory,
} from "../src/services/teaching-scratch-directory.ts";

describe("createTeachingScratchDirectory", () => {
  it("makes an empty directory of its own under the temporary directory", async () => {
    const scratchDirectory = await createTeachingScratchDirectory();

    assert.equal((await stat(scratchDirectory)).isDirectory(), true);
    assert.deepEqual(await readdir(scratchDirectory), []);
    assert.equal(path.dirname(scratchDirectory), await realTemporaryDirectory());

    await removeTeachingScratchDirectory(scratchDirectory);
  });

  it("makes a different directory every time, so two lessons never share one", async () => {
    const first = await createTeachingScratchDirectory();
    const second = await createTeachingScratchDirectory();

    assert.notEqual(first, second);

    await removeTeachingScratchDirectory(first);
    await removeTeachingScratchDirectory(second);
  });
});

describe("removeTeachingScratchDirectory", () => {
  it("takes the directory and everything in it away", async () => {
    const scratchDirectory = await createTeachingScratchDirectory();
    await writeFile(path.join(scratchDirectory, "notes.txt"), "left over");

    await removeTeachingScratchDirectory(scratchDirectory);

    await assert.rejects(() => stat(scratchDirectory));
  });

  it("says nothing when the directory has already gone", async () => {
    const scratchDirectory = await createTeachingScratchDirectory();
    await removeTeachingScratchDirectory(scratchDirectory);

    await removeTeachingScratchDirectory(scratchDirectory);
  });

  it("never throws, because it runs while a lesson is being closed", async () => {
    await removeTeachingScratchDirectory(path.join(tmpdir(), "\u0000not-a-path"));
  });
});

async function realTemporaryDirectory(): Promise<string> {
  const { realpath } = await import("node:fs/promises");
  return realpath(tmpdir());
}
