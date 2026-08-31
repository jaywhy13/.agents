import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  BUILD_STAMP_FILE_NAME,
  inspectFrontendBuild,
  sourceFingerprint,
  writeBuildStamp,
} from "../src/frontend-build.ts";

/**
 * A fresh clone gives every file the same checkout time, so which of two files is
 * "newer" is decided by chance. These tests use one shared timestamp to stand for
 * that, which is why freshness is decided by content and not by modified time.
 */
const CLONE_TIME = new Date("2024-05-01T10:00:00.000Z");
const LATER_TIME = new Date("2024-05-02T10:00:00.000Z");

interface Workspace {
  readonly sourceDirectory: string;
  readonly publicDirectory: string;
}

async function workspace(): Promise<Workspace> {
  const root = await mkdtemp(path.join(tmpdir(), "teach-frontend-"));
  const sourceDirectory = path.join(root, "frontend");
  const publicDirectory = path.join(root, "dist", "public");
  await mkdir(path.join(sourceDirectory, "src"), { recursive: true });
  await mkdir(publicDirectory, { recursive: true });
  return { sourceDirectory, publicDirectory };
}

async function writeFileAt(
  filePath: string,
  content: string,
  modifiedAt: Date = CLONE_TIME,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
  await utimes(filePath, modifiedAt, modifiedAt);
}

/** Builds the page the way the build script does: write files, then stamp them. */
async function buildThePage(
  workspaceToBuild: Workspace,
  extraSourceDirectories: readonly string[] = [],
): Promise<void> {
  await writeFileAt(path.join(workspaceToBuild.publicDirectory, "index.html"), "<!doctype html>");
  await writeBuildStamp({
    sourceDirectory: workspaceToBuild.sourceDirectory,
    publicDirectory: workspaceToBuild.publicDirectory,
    extraSourceDirectories,
  });
}

describe("inspectFrontendBuild", () => {
  it("reports that the lesson page was never built", async () => {
    const { sourceDirectory, publicDirectory } = await workspace();
    await writeFileAt(path.join(sourceDirectory, "src", "main.tsx"), "export {};");

    const status = await inspectFrontendBuild({ sourceDirectory, publicDirectory });

    assert.equal(status.isBuilt, false);
    assert.equal(status.isFresh, false);
  });

  it("reports a fresh build right after the page was built", async () => {
    const built = await workspace();
    await writeFileAt(path.join(built.sourceDirectory, "src", "main.tsx"), "export {};");

    await buildThePage(built);

    const status = await inspectFrontendBuild(built);
    assert.equal(status.isBuilt, true);
    assert.equal(status.isFresh, true);
  });

  it("still reports a fresh build when every file shares one checkout time", async () => {
    const built = await workspace();
    await writeFileAt(path.join(built.sourceDirectory, "src", "main.tsx"), "export {};");
    await buildThePage(built);

    // A fresh clone rewrites every timestamp, source and built output alike.
    for (const filePath of [
      path.join(built.sourceDirectory, "src", "main.tsx"),
      path.join(built.publicDirectory, "index.html"),
      path.join(built.publicDirectory, BUILD_STAMP_FILE_NAME),
    ]) {
      await utimes(filePath, LATER_TIME, LATER_TIME);
    }

    assert.equal((await inspectFrontendBuild(built)).isFresh, true);
  });

  it("reports a stale build and names the source file that changed", async () => {
    const built = await workspace();
    await writeFileAt(path.join(built.sourceDirectory, "src", "App.tsx"), "export {};");
    await buildThePage(built);

    await writeFileAt(path.join(built.sourceDirectory, "src", "App.tsx"), "export const a = 1;");

    const status = await inspectFrontendBuild(built);
    assert.equal(status.isBuilt, true);
    assert.equal(status.isFresh, false);
    assert.match(status.staleReason ?? "", /App\.tsx/);
  });

  it("reports a stale build when a source file is added", async () => {
    const built = await workspace();
    await writeFileAt(path.join(built.sourceDirectory, "src", "main.tsx"), "export {};");
    await buildThePage(built);

    await writeFileAt(path.join(built.sourceDirectory, "src", "extra.tsx"), "export {};");

    assert.equal((await inspectFrontendBuild(built)).isFresh, false);
  });

  it("reports a stale build when a source file is deleted", async () => {
    const built = await workspace();
    await writeFileAt(path.join(built.sourceDirectory, "src", "main.tsx"), "export {};");
    await writeFileAt(path.join(built.sourceDirectory, "src", "extra.tsx"), "export {};");
    await buildThePage(built);

    await writeFile(path.join(built.sourceDirectory, "src", "extra.tsx"), "export {};");
    const { rm } = await import("node:fs/promises");
    await rm(path.join(built.sourceDirectory, "src", "extra.tsx"));

    assert.equal((await inspectFrontendBuild(built)).isFresh, false);
  });

  it("watches the shared code the page imports too", async () => {
    const built = await workspace();
    const sharedDirectory = path.join(built.sourceDirectory, "..", "shared");
    await writeFileAt(path.join(sharedDirectory, "beat.ts"), "export {};");
    await buildThePage(built, [sharedDirectory]);

    await writeFileAt(path.join(sharedDirectory, "beat.ts"), "export const b = 1;");

    const status = await inspectFrontendBuild({
      ...built,
      extraSourceDirectories: [sharedDirectory],
    });
    assert.equal(status.isFresh, false);
    assert.match(status.staleReason ?? "", /beat\.ts/);
  });

  it("ignores installed packages when deciding whether the build is stale", async () => {
    const built = await workspace();
    await writeFileAt(path.join(built.sourceDirectory, "src", "main.tsx"), "export {};");
    await buildThePage(built);

    await writeFileAt(
      path.join(built.sourceDirectory, "node_modules", "react", "index.js"),
      "module.exports = {};",
    );

    assert.equal((await inspectFrontendBuild(built)).isFresh, true);
  });

  it("ignores the built output itself when deciding whether the build is stale", async () => {
    const built = await workspace();
    await writeFileAt(path.join(built.sourceDirectory, "src", "main.tsx"), "export {};");
    await buildThePage(built);

    await writeFileAt(path.join(built.publicDirectory, "assets", "app.js"), "console.log(1);");

    assert.equal((await inspectFrontendBuild(built)).isFresh, true);
  });

  it("says how to fix a build that was made without the build script", async () => {
    const built = await workspace();
    await writeFileAt(path.join(built.sourceDirectory, "src", "main.tsx"), "export {};");
    await writeFileAt(path.join(built.publicDirectory, "index.html"), "<!doctype html>");

    const status = await inspectFrontendBuild(built);

    assert.equal(status.isBuilt, true);
    assert.equal(status.isFresh, false);
    assert.match(status.staleReason ?? "", /build:frontend/);
  });
});

describe("sourceFingerprint", () => {
  it("is the same for the same files, whatever their modified times are", async () => {
    const { sourceDirectory, publicDirectory } = await workspace();
    await writeFileAt(path.join(sourceDirectory, "src", "main.tsx"), "export {};", CLONE_TIME);
    const before = await sourceFingerprint({ sourceDirectory, publicDirectory });

    await utimes(path.join(sourceDirectory, "src", "main.tsx"), LATER_TIME, LATER_TIME);

    assert.equal((await sourceFingerprint({ sourceDirectory, publicDirectory })).digest, before.digest);
  });

  it("changes when a file's content changes", async () => {
    const { sourceDirectory, publicDirectory } = await workspace();
    await writeFileAt(path.join(sourceDirectory, "src", "main.tsx"), "export {};");
    const before = await sourceFingerprint({ sourceDirectory, publicDirectory });

    await writeFileAt(path.join(sourceDirectory, "src", "main.tsx"), "export const a = 1;");

    assert.notEqual(
      (await sourceFingerprint({ sourceDirectory, publicDirectory })).digest,
      before.digest,
    );
  });
});

describe("writeBuildStamp", () => {
  it("leaves a stamp the freshness check can read back", async () => {
    const built = await workspace();
    await writeFileAt(path.join(built.sourceDirectory, "src", "main.tsx"), "export {};");
    await writeFileAt(path.join(built.publicDirectory, "index.html"), "<!doctype html>");

    await writeBuildStamp(built);

    const stamp = JSON.parse(
      await readFile(path.join(built.publicDirectory, BUILD_STAMP_FILE_NAME), "utf8"),
    ) as { digest: string };
    assert.equal(typeof stamp.digest, "string");
    assert.equal((await sourceFingerprint(built)).digest, stamp.digest);
  });
});
