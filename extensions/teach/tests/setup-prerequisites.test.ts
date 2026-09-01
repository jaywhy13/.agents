import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { writeBuildStamp } from "../src/frontend-build.ts";
import {
  describeMissingPrerequisites,
  inspectSetup,
  SETUP_COMMAND,
} from "../src/setup-prerequisites.ts";

async function packageDirectoryWith(
  parts: {
    serverDependencies?: boolean;
    frontendDependencies?: boolean;
    piPackages?: boolean;
    builtPage?: boolean;
    diagramEditorFonts?: boolean;
  } = {},
): Promise<string> {
  const packageDirectory = await mkdtemp(path.join(tmpdir(), "teach-setup-"));
  await mkdir(path.join(packageDirectory, "frontend", "src"), { recursive: true });
  await mkdir(path.join(packageDirectory, "shared"), { recursive: true });
  await writeFile(path.join(packageDirectory, "frontend", "src", "main.tsx"), "export {};");

  if (parts.serverDependencies === true) {
    await mkdir(path.join(packageDirectory, "node_modules", "ws"), { recursive: true });
  }
  if (parts.frontendDependencies === true) {
    await mkdir(path.join(packageDirectory, "frontend", "node_modules", "vite"), {
      recursive: true,
    });
  }
  if (parts.piPackages === true) {
    await mkdir(
      path.join(packageDirectory, "node_modules", "@earendil-works", "pi-coding-agent"),
      { recursive: true },
    );
  }
  if (parts.diagramEditorFonts === true) {
    await mkdir(path.join(packageDirectory, "dist", "public", "fonts", "Excalifont"), {
      recursive: true,
    });
  }
  if (parts.builtPage === true) {
    const publicDirectory = path.join(packageDirectory, "dist", "public");
    await mkdir(publicDirectory, { recursive: true });
    await writeFile(path.join(publicDirectory, "index.html"), "<!doctype html>");
    await writeBuildStamp({
      sourceDirectory: path.join(packageDirectory, "frontend"),
      publicDirectory,
      extraSourceDirectories: [path.join(packageDirectory, "shared")],
    });
  }

  return packageDirectory;
}

async function everythingReady(): Promise<string> {
  return packageDirectoryWith({
    serverDependencies: true,
    frontendDependencies: true,
    piPackages: true,
    builtPage: true,
    diagramEditorFonts: true,
  });
}

function unmet(checks: Awaited<ReturnType<typeof inspectSetup>>): readonly string[] {
  return checks.filter((check) => !check.satisfied).map((check) => check.name);
}

describe("inspectSetup", () => {
  it("is happy when everything the extension needs is in place", async () => {
    const checks = await inspectSetup({ packageDirectory: await everythingReady() });

    assert.deepEqual(unmet(checks), []);
  });

  it("notices that the server dependencies were never installed", async () => {
    const packageDirectory = await packageDirectoryWith({
      frontendDependencies: true,
      piPackages: true,
      builtPage: true,
      diagramEditorFonts: true,
    });

    const checks = await inspectSetup({ packageDirectory });

    assert.deepEqual(unmet(checks), ["server dependencies"]);
  });

  it("notices that the lesson page dependencies were never installed", async () => {
    const packageDirectory = await packageDirectoryWith({
      serverDependencies: true,
      piPackages: true,
      builtPage: true,
      diagramEditorFonts: true,
    });

    const checks = await inspectSetup({ packageDirectory });

    assert.deepEqual(unmet(checks), ["lesson page dependencies"]);
  });

  it("notices that the packages pi supplies are not linked", async () => {
    const packageDirectory = await packageDirectoryWith({
      serverDependencies: true,
      frontendDependencies: true,
      builtPage: true,
      diagramEditorFonts: true,
    });

    const checks = await inspectSetup({ packageDirectory });

    assert.deepEqual(unmet(checks), ["pi packages"]);
  });

  it("notices that the lesson page was never built", async () => {
    const packageDirectory = await packageDirectoryWith({
      serverDependencies: true,
      frontendDependencies: true,
      piPackages: true,
      diagramEditorFonts: true,
    });

    const checks = await inspectSetup({ packageDirectory });

    assert.deepEqual(unmet(checks), ["built lesson page"]);
  });

  it("says exactly what to run for anything that is missing", async () => {
    const checks = await inspectSetup({ packageDirectory: await packageDirectoryWith() });

    for (const check of checks) {
      assert.ok(check.fix.length > 0, `${check.name} does not say how to fix it`);
    }
  });

  it("reports a stale lesson page as something to rebuild", async () => {
    const packageDirectory = await everythingReady();
    await writeFile(
      path.join(packageDirectory, "frontend", "src", "main.tsx"),
      "export const changed = 1;",
    );

    const checks = await inspectSetup({ packageDirectory });

    assert.deepEqual(unmet(checks), ["built lesson page"]);
  });
});

describe("describeMissingPrerequisites", () => {
  it("says nothing when everything is in place", async () => {
    const checks = await inspectSetup({ packageDirectory: await everythingReady() });

    assert.equal(describeMissingPrerequisites(checks, "/somewhere/teach"), null);
  });

  it("names the setup command and the directory to run it in", async () => {
    const checks = await inspectSetup({ packageDirectory: await packageDirectoryWith() });

    const message = describeMissingPrerequisites(checks, "/somewhere/teach");

    assert.ok(message);
    assert.match(message, new RegExp(SETUP_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(message, /\/somewhere\/teach/);
  });
});
