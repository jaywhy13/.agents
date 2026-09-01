#!/usr/bin/env node
import { mkdir, readdir, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Pi supplies `@earendil-works/pi-coding-agent` and `typebox` at run time, so they
 * are peer dependencies and are never bundled. That means they are missing when you
 * run the tests straight from a clone.
 *
 * This links them in from your installed pi so the entry point smoke test can load
 * the extension the way pi does. Everything else runs without it.
 */
const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeModulesDirectory = path.join(packageDirectory, "node_modules");

const piPackageDirectory = await findNewestPiPackage();
if (piPackageDirectory === null) {
  console.error("Could not find an installed pi under ~/.pi/pkg. Set PI_PACKAGE_DIR and retry.");
  process.exit(1);
}

const sourceModules = path.join(piPackageDirectory, "node_modules");
for (const packageName of ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai", "typebox"]) {
  const linkPath = path.join(nodeModulesDirectory, packageName);
  await mkdir(path.dirname(linkPath), { recursive: true });
  await rm(linkPath, { recursive: true, force: true });
  await symlink(path.join(sourceModules, packageName), linkPath, "dir");
  console.log(`linked ${packageName} -> ${piPackageDirectory}`);
}

async function findNewestPiPackage() {
  const fromEnvironment = process.env["PI_PACKAGE_DIR"];
  if (fromEnvironment !== undefined && fromEnvironment.length > 0) {
    return fromEnvironment;
  }

  const packagesDirectory = path.join(homedir(), ".pi", "pkg");
  const entries = await readdir(packagesDirectory).catch(() => []);
  const piVersions = entries.filter((entry) => entry.startsWith("pi-")).sort();
  const newest = piVersions.at(-1);
  return newest === undefined ? null : path.join(packagesDirectory, newest);
}
