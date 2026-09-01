import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface InspectFrontendBuildOptions {
  readonly sourceDirectory: string;
  readonly publicDirectory: string;
  readonly extraSourceDirectories?: readonly string[];
}

export interface FrontendBuildStatus {
  readonly isBuilt: boolean;
  readonly isFresh: boolean;
  readonly publicDirectory: string;
  readonly staleReason?: string;
}

export interface SourceFingerprint {
  /** One value that stands for the content of every page source file. */
  readonly digest: string;
  /** Each source file with its own digest, so a change can be named. */
  readonly files: Readonly<Record<string, string>>;
}

export interface BuildStamp extends SourceFingerprint {
  readonly builtAt: string;
}

/** Left in the built output by the build script, and read by the check below. */
export const BUILD_STAMP_FILE_NAME = ".teach-build-stamp.json";

const BUILD_COMMAND = 'npm run build:frontend';
const IGNORED_DIRECTORY_NAMES = new Set(["node_modules", "dist", ".git", ".vite"]);
const PAGE_ENTRY_FILE_NAME = "index.html";

/**
 * The lesson page is shipped prebuilt so `/teach` never needs a build step at
 * lesson time. This check tells the learner when the shipped build no longer
 * matches the source, which is the usual cause of "my change did not show up".
 *
 * Freshness is decided by content, not by modified time. A fresh clone gives every
 * file the same checkout time, so a time comparison would call a perfectly good
 * build stale, or a stale build fresh, depending on the order git happened to
 * write the files.
 */
export async function inspectFrontendBuild(
  options: InspectFrontendBuildOptions,
): Promise<FrontendBuildStatus> {
  const { publicDirectory } = options;

  const pageEntry = await readFile(path.join(publicDirectory, PAGE_ENTRY_FILE_NAME)).catch(
    () => null,
  );
  if (pageEntry === null) {
    return {
      isBuilt: false,
      isFresh: false,
      publicDirectory,
      staleReason: `The lesson page has not been built yet. Expected files in ${publicDirectory}.`,
    };
  }

  const stamp = await readBuildStamp(publicDirectory);
  if (stamp === null) {
    return {
      isBuilt: true,
      isFresh: false,
      publicDirectory,
      staleReason: `The lesson page has no build stamp, so it cannot be checked. Run "${BUILD_COMMAND}".`,
    };
  }

  const fingerprint = await sourceFingerprint(options);
  if (fingerprint.digest === stamp.digest) {
    return { isBuilt: true, isFresh: true, publicDirectory };
  }

  return {
    isBuilt: true,
    isFresh: false,
    publicDirectory,
    staleReason: describeDifference(stamp, fingerprint),
  };
}

/** Records what the source looked like at build time, inside the built output. */
export async function writeBuildStamp(options: InspectFrontendBuildOptions): Promise<BuildStamp> {
  const fingerprint = await sourceFingerprint(options);
  const stamp: BuildStamp = { ...fingerprint, builtAt: new Date().toISOString() };
  await writeFile(
    path.join(options.publicDirectory, BUILD_STAMP_FILE_NAME),
    `${JSON.stringify(stamp, null, 2)}\n`,
    "utf8",
  );
  return stamp;
}

/** Hashes every page source file, by path and by content. */
export async function sourceFingerprint(
  options: InspectFrontendBuildOptions,
): Promise<SourceFingerprint> {
  const directories = [options.sourceDirectory, ...(options.extraSourceDirectories ?? [])];
  const files: Record<string, string> = {};

  for (const directory of directories) {
    const resolvedDirectory = path.resolve(directory);
    for (const filePath of await sourceFilesUnder(resolvedDirectory, options.publicDirectory)) {
      const relativePath = path.relative(resolvedDirectory, filePath);
      const key = `${path.basename(resolvedDirectory)}/${relativePath.split(path.sep).join("/")}`;
      files[key] = await fileDigest(filePath);
    }
  }

  const wholeSource = createHash("sha256");
  for (const key of Object.keys(files).sort()) {
    wholeSource.update(`${key}\u0000${files[key]}\u0000`);
  }

  return { digest: wholeSource.digest("hex"), files };
}

async function readBuildStamp(publicDirectory: string): Promise<BuildStamp | null> {
  const content = await readFile(path.join(publicDirectory, BUILD_STAMP_FILE_NAME), "utf8").catch(
    () => null,
  );
  if (content === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as Partial<BuildStamp>;
    return typeof parsed.digest === "string" ? (parsed as BuildStamp) : null;
  } catch {
    return null;
  }
}

function describeDifference(stamp: BuildStamp, current: SourceFingerprint): string {
  const stampedFiles = stamp.files ?? {};
  const changed = Object.keys(current.files)
    .filter((key) => stampedFiles[key] !== current.files[key])
    .sort();
  const removed = Object.keys(stampedFiles)
    .filter((key) => current.files[key] === undefined)
    .sort();

  const firstChanged = changed[0] ?? removed[0];
  const named =
    firstChanged === undefined
      ? "The page source no longer matches the built page."
      : `${firstChanged} changed after the lesson page was built.`;
  return `${named} Run "${BUILD_COMMAND}".`;
}

async function fileDigest(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

async function sourceFilesUnder(
  directory: string,
  excludedDirectory: string,
): Promise<readonly string[]> {
  const resolvedExcluded = path.resolve(excludedDirectory);

  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
      if (path.resolve(entryPath) === resolvedExcluded) continue;
      files.push(...(await sourceFilesUnder(entryPath, excludedDirectory)));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}
