import type { GithubApiRunner } from "./github-api-runner.ts";
import { GithubApiError } from "./github-api-runner.ts";
import type {
  GithubFileTarget,
  GithubGistTarget,
  GithubIssueTarget,
  GithubPullRequestTarget,
  GithubReference,
  GithubRepositoryTarget,
  GithubTarget,
  ReferenceContent,
} from "./reference.ts";
import { ReferenceCopyError } from "./reference.ts";

const LARGEST_FILE_BYTES = 1_000_000;

/**
 * Copies what a github.com link points at, through the GitHub API rather than by
 * scraping the page. The link text is parsed into a target before it ever gets
 * here, so this client only ever handles named parts — owner, repository, number,
 * path — and builds API paths from them.
 */
export class GithubReferenceClient {
  private readonly githubApiRunner: GithubApiRunner;

  constructor(githubApiRunner: GithubApiRunner) {
    this.githubApiRunner = githubApiRunner;
  }

  async copy(reference: GithubReference): Promise<ReferenceContent> {
    try {
      return await this.copyTarget(reference.target, reference.url);
    } catch (cause) {
      if (cause instanceof ReferenceCopyError) {
        throw cause;
      }
      throw new ReferenceCopyError(
        `${reference.label} could not be copied from ${reference.url}: ${describeCause(cause)}`,
        { cause },
      );
    }
  }

  private async copyTarget(target: GithubTarget, sourceUrl: string): Promise<ReferenceContent> {
    if (target.kind === "repository") {
      return this.copyRepository(target, sourceUrl);
    }
    if (target.kind === "issue") {
      return this.copyIssue(target, sourceUrl);
    }
    if (target.kind === "pull_request") {
      return this.copyPullRequest(target, sourceUrl);
    }
    if (target.kind === "file") {
      return this.copyFile(target, sourceUrl);
    }
    if (target.kind === "gist") {
      return this.copyGist(target, sourceUrl);
    }
    throw new ReferenceCopyError(
      `Unknown GitHub reference target: ${String((target as { kind: string }).kind)}`,
    );
  }

  private async copyRepository(
    target: GithubRepositoryTarget,
    sourceUrl: string,
  ): Promise<ReferenceContent> {
    const repositoryPath = `repos/${segment(target.owner)}/${segment(target.repository)}`;
    const repository = asRecord(await this.githubApiRunner.requestJson(repositoryPath));
    const readmeText = await this.readmeTextOf(repositoryPath);

    const description = textField(repository, "description");
    const heading = `# ${target.owner}/${target.repository}`;
    const parts = [heading, description, readmeText].filter(
      (part): part is string => part !== null && part.length > 0,
    );

    return {
      text: parts.join("\n\n"),
      mediaType: "text/markdown",
      sourceUrl,
      title: `${target.owner}/${target.repository}`,
    };
  }

  private async copyIssue(
    target: GithubIssueTarget,
    sourceUrl: string,
  ): Promise<ReferenceContent> {
    const issue = asRecord(
      await this.githubApiRunner.requestJson(
        `repos/${segment(target.owner)}/${segment(target.repository)}/issues/${target.number}`,
      ),
    );
    return this.discussionContent(issue, sourceUrl, `issue #${target.number}`);
  }

  private async copyPullRequest(
    target: GithubPullRequestTarget,
    sourceUrl: string,
  ): Promise<ReferenceContent> {
    const pullRequest = asRecord(
      await this.githubApiRunner.requestJson(
        `repos/${segment(target.owner)}/${segment(target.repository)}/pulls/${target.number}`,
      ),
    );
    return this.discussionContent(pullRequest, sourceUrl, `pull request #${target.number}`);
  }

  private discussionContent(
    record: Readonly<Record<string, unknown>>,
    sourceUrl: string,
    fallbackTitle: string,
  ): ReferenceContent {
    const title = textField(record, "title") ?? fallbackTitle;
    const body = textField(record, "body") ?? "";
    return {
      text: `# ${title}\n\n${body}`.trim(),
      mediaType: "text/markdown",
      sourceUrl,
      title,
    };
  }

  private async copyFile(target: GithubFileTarget, sourceUrl: string): Promise<ReferenceContent> {
    const contentsPath =
      `repos/${segment(target.owner)}/${segment(target.repository)}/contents/${filePathSegments(target.filePath)}` +
      `?ref=${segment(target.gitReference)}`;
    const file = asRecord(await this.githubApiRunner.requestJson(contentsPath));

    const encoding = textField(file, "encoding");
    const encodedContent = textField(file, "content");
    if (encoding !== "base64" || encodedContent === null) {
      throw new ReferenceCopyError(
        `${target.filePath} is not a text file GitHub can hand over as content.`,
      );
    }

    const decoded = Buffer.from(encodedContent, "base64");
    if (decoded.byteLength > LARGEST_FILE_BYTES) {
      throw new ReferenceCopyError(
        `${target.filePath} is larger than the ${LARGEST_FILE_BYTES} byte limit for a reference.`,
      );
    }
    if (looksBinary(decoded)) {
      throw new ReferenceCopyError(`${target.filePath} is not text, so a lesson cannot read it.`);
    }

    return {
      text: decoded.toString("utf8"),
      mediaType: "text/plain",
      sourceUrl,
      title: `${target.owner}/${target.repository}: ${target.filePath}`,
    };
  }

  /**
   * A gist is one or more small files with a description. They are joined into one
   * document, each under its own heading, because a lesson reads a reference as text
   * and a gist is almost always read as a whole.
   */
  private async copyGist(target: GithubGistTarget, sourceUrl: string): Promise<ReferenceContent> {
    const gist = asRecord(await this.githubApiRunner.requestJson(`gists/${segment(target.gistId)}`));
    const description = textField(gist, "description");
    const title = description ?? `gist ${target.gistId}`;

    const parts: string[] = [`# ${title}`];
    let keptBytes = 0;
    for (const [fileName, fileRecord] of Object.entries(asRecord(gist["files"] ?? {}))) {
      const content = textField(asRecord(fileRecord), "content");
      if (content === null) {
        continue;
      }
      keptBytes += Buffer.byteLength(content, "utf8");
      if (keptBytes > LARGEST_FILE_BYTES) {
        throw new ReferenceCopyError(
          `Gist ${target.gistId} is larger than the ${LARGEST_FILE_BYTES} byte limit for a reference.`,
        );
      }
      parts.push(`## ${fileName}\n\n${content}`);
    }

    if (parts.length === 1) {
      throw new ReferenceCopyError(`Gist ${target.gistId} has no text a lesson can read.`);
    }

    return {
      text: parts.join("\n\n"),
      mediaType: "text/markdown",
      sourceUrl,
      title,
    };
  }

  /** A repository with no README is still a usable reference, so 404 is not a failure. */
  private async readmeTextOf(repositoryPath: string): Promise<string | null> {
    let readme: Readonly<Record<string, unknown>>;
    try {
      readme = asRecord(await this.githubApiRunner.requestJson(`${repositoryPath}/readme`));
    } catch (cause) {
      if (cause instanceof GithubApiError && cause.statusCode === 404) {
        return null;
      }
      throw cause;
    }

    const encodedContent = textField(readme, "content");
    if (textField(readme, "encoding") !== "base64" || encodedContent === null) {
      return null;
    }
    return Buffer.from(encodedContent, "base64").toString("utf8");
  }
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

function filePathSegments(filePath: string): string {
  return filePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function asRecord(candidate: unknown): Readonly<Record<string, unknown>> {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new ReferenceCopyError("GitHub answered with something that is not a record.");
  }
  return candidate as Record<string, unknown>;
}

function textField(record: Readonly<Record<string, unknown>>, fieldName: string): string | null {
  const value = record[fieldName];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** A null byte in the first kilobyte is the usual sign that a file is not text. */
function looksBinary(content: Buffer): boolean {
  const sample = content.subarray(0, 1024);
  return sample.includes(0);
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
