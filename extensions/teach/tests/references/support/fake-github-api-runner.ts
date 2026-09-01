import type { GithubApiRunner } from "../../../src/references/github-api-runner.ts";
import { GithubApiError } from "../../../src/references/github-api-runner.ts";

/**
 * Stands in for the GitHub API. It records every path asked for, which is how the
 * tests check that a link was turned into named parts and never passed through as
 * text.
 */
export class FakeGithubApiRunner implements GithubApiRunner {
  readonly requestedApiPaths: string[] = [];
  private readonly answersByApiPath = new Map<string, unknown>();
  private readonly statusCodesByApiPath = new Map<string, number>();

  answerWith(apiPath: string, answer: unknown): this {
    this.answersByApiPath.set(apiPath, answer);
    return this;
  }

  failWith(apiPath: string, statusCode: number): this {
    this.statusCodesByApiPath.set(apiPath, statusCode);
    return this;
  }

  async requestJson(apiPath: string): Promise<unknown> {
    this.requestedApiPaths.push(apiPath);

    const statusCode = this.statusCodesByApiPath.get(apiPath);
    if (statusCode !== undefined) {
      throw new GithubApiError(`HTTP ${statusCode}`, apiPath, statusCode);
    }
    if (!this.answersByApiPath.has(apiPath)) {
      throw new GithubApiError(`HTTP 404`, apiPath, 404);
    }
    return this.answersByApiPath.get(apiPath);
  }
}

export function base64Content(text: string): Record<string, unknown> {
  return { encoding: "base64", content: Buffer.from(text, "utf8").toString("base64") };
}
