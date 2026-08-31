import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { StaticAssetRepository } from "../src/server/static-asset-repository.ts";

async function publicDirectoryWithIndexPage(): Promise<string> {
  const parentDirectory = await mkdtemp(path.join(tmpdir(), "teach-assets-"));
  const publicDirectory = path.join(parentDirectory, "public");
  await mkdir(path.join(publicDirectory, "assets"), { recursive: true });
  await writeFile(path.join(publicDirectory, "index.html"), "<!doctype html><title>Teach</title>");
  await writeFile(path.join(publicDirectory, "assets", "app.js"), "console.log('lesson');");
  await writeFile(path.join(parentDirectory, "private-notes.txt"), "not for the browser");
  return publicDirectory;
}

describe("StaticAssetRepository", () => {
  it("serves the index page for the root path", async () => {
    const repository = new StaticAssetRepository(await publicDirectoryWithIndexPage());

    const asset = await repository.get("/");

    assert.ok(asset);
    assert.equal(asset.contentType, "text/html; charset=utf-8");
    assert.match(asset.bytes.toString("utf8"), /Teach/);
  });

  it("serves a nested asset with its content type", async () => {
    const repository = new StaticAssetRepository(await publicDirectoryWithIndexPage());

    const asset = await repository.get("/assets/app.js");

    assert.ok(asset);
    assert.equal(asset.contentType, "text/javascript; charset=utf-8");
  });

  it("refuses a path that climbs out of the public directory", async () => {
    const repository = new StaticAssetRepository(await publicDirectoryWithIndexPage());

    assert.equal(await repository.get("/../private-notes.txt"), null);
    assert.equal(await repository.get("/assets/../../private-notes.txt"), null);
  });

  it("refuses a percent-encoded climb out of the public directory", async () => {
    const repository = new StaticAssetRepository(await publicDirectoryWithIndexPage());

    assert.equal(await repository.get("/%2e%2e/private-notes.txt"), null);
    assert.equal(await repository.get("/..%2fprivate-notes.txt"), null);
  });

  it("refuses a path that reaches outside through a symbolic link", async () => {
    const publicDirectory = await publicDirectoryWithIndexPage();
    await symlink(
      path.join(publicDirectory, "..", "private-notes.txt"),
      path.join(publicDirectory, "escape.txt"),
    );
    const repository = new StaticAssetRepository(publicDirectory);

    assert.equal(await repository.get("/escape.txt"), null);
  });

  it("refuses a null byte in the path", async () => {
    const repository = new StaticAssetRepository(await publicDirectoryWithIndexPage());

    assert.equal(await repository.get("/index.html\u0000.png"), null);
  });

  it("returns nothing for a file that does not exist", async () => {
    const repository = new StaticAssetRepository(await publicDirectoryWithIndexPage());

    assert.equal(await repository.get("/missing.css"), null);
  });
});
