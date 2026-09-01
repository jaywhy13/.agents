import { GITHUB_REFERENCE_HOSTNAMES, isGithubReferenceHostname } from "../../shared/github-hosts.ts";
import type { GithubTarget } from "./reference.ts";
import { InvalidReferenceError } from "./reference.ts";

export { GITHUB_REFERENCE_HOSTNAMES, isGithubReferenceHostname };

export const GIST_HOSTNAME = "gist.github.com";

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const GIT_REFERENCE_PATTERN = /^[A-Za-z0-9._\-/]{1,255}$/;
/** A gist id is a hexadecimal name GitHub gave it, never anything the learner chose. */
const GIST_ID_PATTERN = /^[0-9a-f]{20,64}$/;

/**
 * Turns a GitHub link into the exact thing it points at, so later code can ask the
 * GitHub API for that thing by its parts. Nothing downstream ever sees the link text
 * again, which is what keeps the link out of a command line.
 *
 * Only the five shapes a lesson can use are accepted — a repository, an issue, a
 * pull request, a file and a gist. Anything else, such as a search page, a settings
 * page or a wiki, is refused rather than guessed at.
 */
export function parseGithubUrl(url: URL): GithubTarget {
  if (!isGithubReferenceHostname(url.hostname)) {
    throw new InvalidReferenceError(`${url.hostname} is not a GitHub address.`);
  }

  const segments = decodedPathSegments(url);
  if (url.hostname.toLowerCase() === GIST_HOSTNAME) {
    return gistTarget(segments);
  }
  return repositoryTarget(segments, url);
}

/**
 * A gist is written either as `/<owner>/<gist id>` or as `/<gist id>` on its own,
 * and either may be followed by a revision. One explicit branch per shape, so a
 * segment that only looks like a gist id cannot be picked out of the middle of a
 * path.
 */
function gistTarget(segments: readonly string[]): GithubTarget {
  const idAfterOwner = segments[1];
  if (idAfterOwner !== undefined && GIST_ID_PATTERN.test(idAfterOwner)) {
    return { kind: "gist", gistId: idAfterOwner };
  }

  const idOnItsOwn = segments[0];
  if (idOnItsOwn !== undefined && GIST_ID_PATTERN.test(idOnItsOwn)) {
    return { kind: "gist", gistId: idOnItsOwn };
  }

  throw new InvalidReferenceError(
    "A gist link must name the gist, for example https://gist.github.com/owner/0123456789abcdef0123456789abcdef.",
  );
}

function repositoryTarget(segments: readonly string[], url: URL): GithubTarget {
  if (segments.length < 2) {
    throw new InvalidReferenceError(
      "A GitHub link must name an owner and a repository, for example https://github.com/owner/repo.",
    );
  }
  const owner = requireOwner(segments[0]);
  const repository = requireRepository(segments[1]);

  if (segments.length === 2) {
    return { kind: "repository", owner, repository };
  }

  const section = segments[2];
  const rest = segments.slice(3);

  if (section === "issues") {
    return { kind: "issue", owner, repository, number: requireNumber(rest, "issue") };
  }
  if (section === "pull" || section === "pulls") {
    return {
      kind: "pull_request",
      owner,
      repository,
      number: requireNumber(rest, "pull request"),
    };
  }
  if (section === "blob" || section === "raw") {
    return fileTarget(owner, repository, rest);
  }

  throw new InvalidReferenceError(
    `A GitHub reference must point at a repository, an issue, a pull request, a file or a gist. ${url.href} does not.`,
  );
}

function fileTarget(owner: string, repository: string, rest: readonly string[]): GithubTarget {
  const gitReference = rest[0];
  const filePathSegments = rest.slice(1);
  if (gitReference === undefined || filePathSegments.length === 0) {
    throw new InvalidReferenceError(
      "A GitHub file reference needs a branch, tag or commit and a file path.",
    );
  }
  if (!GIT_REFERENCE_PATTERN.test(gitReference) || gitReference.includes("..")) {
    throw new InvalidReferenceError(`Unusable git reference: ${gitReference}`);
  }

  for (const segment of filePathSegments) {
    if (segment.length === 0 || segment === "." || segment === ".." || segment.includes("..")) {
      throw new InvalidReferenceError("A GitHub file path may not step outside the repository.");
    }
  }

  return {
    kind: "file",
    owner,
    repository,
    gitReference,
    filePath: filePathSegments.join("/"),
  };
}

function decodedPathSegments(url: URL): readonly string[] {
  const segments: string[] = [];
  for (const rawSegment of url.pathname.split("/")) {
    if (rawSegment.length === 0) {
      continue;
    }
    let decodedSegment: string;
    try {
      decodedSegment = decodeURIComponent(rawSegment);
    } catch {
      throw new InvalidReferenceError(`GitHub link has an unreadable path: ${url.pathname}`);
    }
    // An escaped slash would turn one segment back into several, which is how a
    // path climbs out of the repository it is supposed to stay inside.
    if (decodedSegment.includes("/") || decodedSegment.includes("\\")) {
      throw new InvalidReferenceError(
        `GitHub link has an escaped path separator in it: ${url.pathname}`,
      );
    }
    segments.push(decodedSegment);
  }
  return segments;
}

function requireOwner(candidate: string | undefined): string {
  if (candidate === undefined || !OWNER_PATTERN.test(candidate)) {
    throw new InvalidReferenceError(`Unusable GitHub owner name: ${String(candidate)}`);
  }
  return candidate;
}

function requireRepository(candidate: string | undefined): string {
  if (
    candidate === undefined ||
    !REPOSITORY_PATTERN.test(candidate) ||
    candidate === "." ||
    candidate === ".."
  ) {
    throw new InvalidReferenceError(`Unusable GitHub repository name: ${String(candidate)}`);
  }
  return candidate.endsWith(".git") ? candidate.slice(0, -".git".length) : candidate;
}

function requireNumber(rest: readonly string[], label: string): number {
  const candidate = rest[0];
  if (candidate === undefined || !/^[0-9]{1,10}$/.test(candidate)) {
    throw new InvalidReferenceError(`A GitHub ${label} link must end with its number.`);
  }
  const parsed = Number.parseInt(candidate, 10);
  if (parsed <= 0) {
    throw new InvalidReferenceError(`A GitHub ${label} number must be 1 or more.`);
  }
  return parsed;
}
