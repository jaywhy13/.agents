import type { ReferenceKind } from "../../shared/lesson.ts";

/**
 * What a learner hands the lesson before it starts: a link, a GitHub link, or a
 * block of text they pasted. This is the raw, unchecked shape. Every other type in
 * this module describes material that has already been checked.
 */
export interface ReferenceInput {
  readonly kind: ReferenceKind;
  readonly label: string;
  readonly value: string;
}

/** A plain web page or document the lesson may copy over http or https. */
export interface UrlReference {
  readonly kind: "url";
  readonly label: string;
  readonly url: string;
}

export interface GithubRepositoryTarget {
  readonly kind: "repository";
  readonly owner: string;
  readonly repository: string;
}

export interface GithubIssueTarget {
  readonly kind: "issue";
  readonly owner: string;
  readonly repository: string;
  readonly number: number;
}

export interface GithubPullRequestTarget {
  readonly kind: "pull_request";
  readonly owner: string;
  readonly repository: string;
  readonly number: number;
}

export interface GithubFileTarget {
  readonly kind: "file";
  readonly owner: string;
  readonly repository: string;
  /** The branch, tag or commit the link points at. */
  readonly gitReference: string;
  readonly filePath: string;
}

/** A gist has no owner and no repository: the id is the whole address of it. */
export interface GithubGistTarget {
  readonly kind: "gist";
  readonly gistId: string;
}

export type GithubTarget =
  | GithubRepositoryTarget
  | GithubIssueTarget
  | GithubPullRequestTarget
  | GithubFileTarget
  | GithubGistTarget;

/** A github.com link the lesson understood well enough to name what it points at. */
export interface GithubReference {
  readonly kind: "github";
  readonly label: string;
  readonly url: string;
  readonly target: GithubTarget;
}

/** Text the learner pasted in. There is nothing to fetch. */
export interface PastedTextReference {
  readonly kind: "pasted";
  readonly label: string;
  readonly text: string;
}

export type Reference = UrlReference | GithubReference | PastedTextReference;

/**
 * The copied material itself, as the client that went and got it saw it. The
 * client does not decide when it was copied or what it is called on disk; the
 * service does that, so a client stays a client.
 */
export interface ReferenceContent {
  readonly text: string;
  readonly mediaType: string;
  readonly sourceUrl: string | null;
  readonly title: string | null;
}

/** One reference, copied and written down under a lesson. */
export interface StoredReference {
  readonly referenceId: string;
  readonly lessonId: string;
  readonly kind: ReferenceKind;
  readonly label: string;
  readonly sourceUrl: string | null;
  readonly title: string | null;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly lineCount: number;
  readonly copiedAt: string;
  readonly contentFileName: string;
}

/** The input could not be read as a reference at all. */
export class InvalidReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReferenceError";
  }
}

/** The reference was understood, but copying it did not work. */
export class ReferenceCopyError extends Error {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "ReferenceCopyError";
  }
}

const REFERENCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * Reference identifiers become file names inside a lesson directory, so anything
 * that could climb out of that directory is refused before it reaches the
 * filesystem.
 */
export function requireReferenceId(candidate: unknown): string {
  if (typeof candidate !== "string" || !REFERENCE_ID_PATTERN.test(candidate)) {
    throw new InvalidReferenceError(
      "A reference id must be 1 to 64 characters of letters, digits, hyphen or underscore.",
    );
  }
  return candidate;
}
