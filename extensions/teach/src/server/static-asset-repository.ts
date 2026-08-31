import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

export interface StaticAsset {
  readonly contentType: string;
  readonly bytes: Buffer;
}

const CONTENT_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

/**
 * Reads the prebuilt frontend files. Every request path is resolved and then
 * checked against the real public directory, so neither `..` segments nor
 * symbolic links can reach a file the learner's browser should never see.
 */
export class StaticAssetRepository {
  private readonly publicDirectory: string;

  constructor(publicDirectory: string) {
    this.publicDirectory = publicDirectory;
  }

  async get(requestPath: string): Promise<StaticAsset | null> {
    const relativePath = safeRelativePath(requestPath);
    if (relativePath === null) {
      return null;
    }

    const candidatePath = path.join(this.publicDirectory, relativePath);
    const resolvedPath = await resolveWithinDirectory(candidatePath, this.publicDirectory);
    if (resolvedPath === null) {
      return null;
    }

    let bytes: Buffer;
    try {
      bytes = await readFile(resolvedPath);
    } catch {
      return null;
    }

    return { contentType: contentTypeFor(resolvedPath), bytes };
  }
}

function safeRelativePath(requestPath: string): string | null {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  if (decodedPath.includes("\u0000")) {
    return null;
  }

  const withoutQuery = decodedPath.split("?")[0] ?? "";
  const normalizedPath = path.posix.normalize(withoutQuery);
  if (normalizedPath === "/" || normalizedPath === "" || normalizedPath === ".") {
    return "index.html";
  }

  const relativePath = normalizedPath.replace(/^\/+/, "");
  const segments = relativePath.split("/");
  if (segments.some((segment) => segment === "..")) {
    return null;
  }
  if (path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
    return null;
  }

  return relativePath;
}

async function resolveWithinDirectory(
  candidatePath: string,
  directory: string,
): Promise<string | null> {
  let realDirectory: string;
  let realCandidate: string;
  try {
    realDirectory = await realpath(directory);
    realCandidate = await realpath(candidatePath);
  } catch {
    return null;
  }

  const relativeToDirectory = path.relative(realDirectory, realCandidate);
  const escapesDirectory =
    relativeToDirectory.startsWith("..") || path.isAbsolute(relativeToDirectory);

  return escapesDirectory ? null : realCandidate;
}

function contentTypeFor(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";
}
