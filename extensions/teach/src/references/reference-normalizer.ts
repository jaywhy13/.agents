import { isGithubReferenceHostname, parseGithubUrl } from "./github-url.ts";
import type { GithubReference, PastedTextReference, Reference, UrlReference } from "./reference.ts";
import type { ReferenceInput } from "./reference.ts";
import { InvalidReferenceError } from "./reference.ts";

const LONGEST_LABEL_CHARACTERS = 120;
const LONGEST_PASTED_CHARACTERS = 500_000;
const ALLOWED_SCHEMES = ["http:", "https:"] as const;

/**
 * Turns what the learner typed into one of the three references the lesson knows
 * how to copy. Every later step reads the value object, never the raw input, so
 * the checks here happen exactly once.
 *
 * A GitHub link is always a GitHub reference even when the learner picked "url" on
 * the form, because the GitHub client can read it far better than a page scrape can.
 * Only the three GitHub hosts count; `docs.github.com` is a web page like any other.
 */
export function normalizeReference(input: ReferenceInput): Reference {
  const label = normalizeLabel(input.label);

  if (input.kind === "pasted") {
    return pastedTextReference(label, input.value);
  }
  if (input.kind === "url" || input.kind === "github") {
    return linkReference(label, input.value, input.kind);
  }

  throw new InvalidReferenceError(`Unknown reference kind: ${String(input.kind)}`);
}

export function normalizeReferences(inputs: readonly ReferenceInput[]): readonly Reference[] {
  return inputs.map((input) => normalizeReference(input));
}

function linkReference(
  label: string,
  rawValue: string,
  kind: "url" | "github",
): UrlReference | GithubReference {
  const url = parseLinkOrThrow(rawValue);

  if (isGithubReferenceHostname(url.hostname)) {
    return { kind: "github", label, url: url.href, target: parseGithubUrl(url) };
  }
  if (kind === "github") {
    throw new InvalidReferenceError(
      `A GitHub reference must be a github.com or gist.github.com link. ${url.hostname} is not.`,
    );
  }
  return { kind: "url", label, url: url.href };
}

function parseLinkOrThrow(rawValue: string): URL {
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    throw new InvalidReferenceError("A link reference needs an address.");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new InvalidReferenceError(
      `${trimmed} is not a full web address. Include http:// or https://.`,
    );
  }

  if (!(ALLOWED_SCHEMES as readonly string[]).includes(url.protocol)) {
    throw new InvalidReferenceError(
      `Only http and https links can be used as references. ${url.protocol} cannot.`,
    );
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new InvalidReferenceError("A reference link may not carry a username or a password.");
  }

  // The fragment only ever matters to a browser, and keeping it would make two
  // links to the same page look like two different references.
  url.hash = "";
  return url;
}

function pastedTextReference(label: string, rawValue: string): PastedTextReference {
  const text = normalizePastedText(rawValue);
  if (text.length === 0) {
    throw new InvalidReferenceError("A pasted reference needs some text.");
  }
  if (text.length > LONGEST_PASTED_CHARACTERS) {
    throw new InvalidReferenceError(
      `A pasted reference may be at most ${LONGEST_PASTED_CHARACTERS} characters.`,
    );
  }
  return { kind: "pasted", label, text };
}

/** Windows and old Mac line endings become newlines so line counts mean one thing. */
export function normalizePastedText(rawValue: string): string {
  return rawValue.replace(/\r\n?/g, "\n").trim();
}

function normalizeLabel(rawLabel: string): string {
  const label = rawLabel.replace(/\s+/g, " ").trim();
  if (label.length === 0) {
    throw new InvalidReferenceError("A reference needs a label.");
  }
  if (label.length > LONGEST_LABEL_CHARACTERS) {
    throw new InvalidReferenceError(
      `A reference label may be at most ${LONGEST_LABEL_CHARACTERS} characters.`,
    );
  }
  return label;
}
