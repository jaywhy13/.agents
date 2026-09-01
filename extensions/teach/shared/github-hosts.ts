/**
 * Which addresses count as GitHub.
 *
 * A GitHub reference is not read by fetching the page: it is taken apart into named
 * parts and read through the GitHub API. So "is this GitHub" decides which client
 * copies a reference, and it has to give the same answer in all three places that
 * ask — the setup form, the message the page sends, and the normalizer that turns
 * the message into a reference. When they disagree, a link is accepted by one and
 * refused by the next.
 *
 * The list is exact rather than a suffix test. `docs.github.com` also ends in
 * `github.com`, and it is documentation to read as a web page, not a repository,
 * an issue, a pull request, a file or a gist. Matching by suffix sent it to a
 * client that could only refuse it.
 *
 * This module is pure: no node built-ins, so the lesson page can use it too.
 */

export const GITHUB_REFERENCE_HOSTNAMES = [
  "github.com",
  "www.github.com",
  "gist.github.com",
] as const;

export function isGithubReferenceHostname(hostname: string): boolean {
  return (GITHUB_REFERENCE_HOSTNAMES as readonly string[]).includes(hostname.toLowerCase());
}
