import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { SafeHttpClient } from "./safe-http-client.ts";
import { HttpStatusError } from "./safe-http-client.ts";

const runCommand = promisify(execFile);

export const GITHUB_API_ORIGIN = "https://api.github.com";
const DEFAULT_COMMAND_TIMEOUT_MILLISECONDS = 15_000;
/** The probe is a yes-or-no question asked once, so it waits far less than a read. */
const DEFAULT_PROBE_TIMEOUT_MILLISECONDS = 5_000;
const LARGEST_COMMAND_OUTPUT_BYTES = 4_000_000;
const LARGEST_PROBE_OUTPUT_BYTES = 100_000;

/**
 * An API path such as `repos/owner/name/issues/12`. It is never a whole address
 * and never anything the learner typed: it is assembled from parts that were
 * already checked, which is what keeps a link out of a command line.
 */
const API_PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~\-/%]*(\?[A-Za-z0-9._~\-/%=&]*)?$/;

export class GithubApiError extends Error {
  readonly statusCode: number | null;
  readonly apiPath: string;

  constructor(message: string, apiPath: string, statusCode: number | null) {
    super(message);
    this.name = "GithubApiError";
    this.apiPath = apiPath;
    this.statusCode = statusCode;
  }
}

/** Asks the GitHub API one read-only question and gives back the parsed answer. */
export interface GithubApiRunner {
  requestJson(apiPath: string): Promise<unknown>;
}

export function requireApiPath(apiPath: string): string {
  if (!API_PATH_PATTERN.test(apiPath)) {
    throw new GithubApiError(`Refusing to request an unusable API path.`, apiPath, null);
  }
  return apiPath;
}

/**
 * Uses the learner's own `gh` command, so a lesson can read a private repository
 * the learner already has access to without this module ever handling a token.
 *
 * The path is passed as a separate argument to `execFile`, which starts the
 * program directly. There is no shell, so there is nothing for quotes, semicolons
 * or backticks in a reference to do.
 */
export class GhCommandGithubApiRunner implements GithubApiRunner {
  private readonly commandTimeoutMilliseconds: number;

  constructor(commandTimeoutMilliseconds: number = DEFAULT_COMMAND_TIMEOUT_MILLISECONDS) {
    this.commandTimeoutMilliseconds = commandTimeoutMilliseconds;
  }

  async requestJson(apiPath: string): Promise<unknown> {
    const checkedPath = requireApiPath(apiPath);

    let standardOutput: string;
    try {
      const finished = await runCommand(
        "gh",
        ["api", "--method", "GET", "--header", "Accept: application/vnd.github+json", checkedPath],
        {
          timeout: this.commandTimeoutMilliseconds,
          maxBuffer: LARGEST_COMMAND_OUTPUT_BYTES,
          shell: false,
          windowsHide: true,
        },
      );
      standardOutput = finished.stdout;
    } catch (cause) {
      throw new GithubApiError(
        `gh api ${checkedPath} did not work: ${describeCause(cause)}`,
        checkedPath,
        statusCodeInMessage(cause),
      );
    }

    try {
      return JSON.parse(standardOutput) as unknown;
    } catch {
      throw new GithubApiError(`gh api ${checkedPath} did not answer with JSON.`, checkedPath, null);
    }
  }
}

/**
 * Reads the public GitHub API over the same guarded HTTP client every other link
 * goes through. Used when `gh` is not installed. It sees only public material.
 */
export class PublicHttpGithubApiRunner implements GithubApiRunner {
  private readonly safeHttpClient: SafeHttpClient;

  constructor(safeHttpClient: SafeHttpClient) {
    this.safeHttpClient = safeHttpClient;
  }

  async requestJson(apiPath: string): Promise<unknown> {
    const checkedPath = requireApiPath(apiPath);
    try {
      return await this.safeHttpClient.fetchJson(
        `${GITHUB_API_ORIGIN}/${checkedPath}`,
        "application/vnd.github+json",
      );
    } catch (cause) {
      throw new GithubApiError(
        `The GitHub API could not be read: ${describeCause(cause)}`,
        checkedPath,
        cause instanceof HttpStatusError ? cause.statusCode : null,
      );
    }
  }
}

/** Says whether the learner's `gh` command can read GitHub for this lesson. */
export interface GithubCommandProbe {
  canReadGithub(): Promise<boolean>;
}

/**
 * Asks `gh` whether it is signed in.
 *
 * The question is not "is `gh` on this machine" but "can `gh` read GitHub as this
 * learner". An installed but signed-out `gh` refuses every read, so it must not be
 * chosen over the public API, which at least reads public material.
 *
 * `execFile` starts the program directly, with no shell and no arguments that came
 * from anywhere but this file, so there is nothing here for a reference to reach.
 */
export class ExecutedGithubCommandProbe implements GithubCommandProbe {
  private readonly probeTimeoutMilliseconds: number;

  constructor(probeTimeoutMilliseconds: number = DEFAULT_PROBE_TIMEOUT_MILLISECONDS) {
    this.probeTimeoutMilliseconds = probeTimeoutMilliseconds;
  }

  async canReadGithub(): Promise<boolean> {
    try {
      await runCommand("gh", ["auth", "status"], {
        timeout: this.probeTimeoutMilliseconds,
        maxBuffer: LARGEST_PROBE_OUTPUT_BYTES,
        shell: false,
        windowsHide: true,
      });
      return true;
    } catch {
      // Not installed, not signed in, or too slow to answer. All three mean the same
      // thing to the caller: read GitHub some other way.
      return false;
    }
  }
}

export interface GithubCommandOrPublicApiRunnerParts {
  readonly githubCommandRunner: GithubApiRunner;
  readonly publicApiRunner: GithubApiRunner;
  readonly githubCommandProbe: GithubCommandProbe;
}

/**
 * Reads GitHub through the learner's own `gh` when that will work, and through the
 * public GitHub API when it will not.
 *
 * This is what a lesson uses in production. `gh` is preferred because it reads a
 * private repository the learner already has access to without this extension ever
 * handling a token; the public API is the fallback rather than a failure, because a
 * lesson about a public repository must not need `gh` installed.
 *
 * The probe runs once for the whole pi session and its answer is shared by every
 * reference, including ones copied at the same moment. Probing per reference would
 * start a process per reference for an answer that does not change.
 */
export class GithubCommandOrPublicApiRunner implements GithubApiRunner {
  private readonly githubCommandRunner: GithubApiRunner;
  private readonly publicApiRunner: GithubApiRunner;
  private readonly githubCommandProbe: GithubCommandProbe;
  private chosenRunner: Promise<GithubApiRunner> | null = null;

  constructor(parts: GithubCommandOrPublicApiRunnerParts) {
    this.githubCommandRunner = parts.githubCommandRunner;
    this.publicApiRunner = parts.publicApiRunner;
    this.githubCommandProbe = parts.githubCommandProbe;
  }

  async requestJson(apiPath: string): Promise<unknown> {
    // Checked before the probe, so an unusable path is refused the same way whichever
    // runner would have served it, and without starting a process.
    const checkedPath = requireApiPath(apiPath);
    const runner = await this.runnerForThisSession();
    return runner.requestJson(checkedPath);
  }

  private runnerForThisSession(): Promise<GithubApiRunner> {
    this.chosenRunner ??= this.githubCommandProbe
      .canReadGithub()
      .catch(() => false)
      .then((canReadGithub) =>
        canReadGithub ? this.githubCommandRunner : this.publicApiRunner,
      );
    return this.chosenRunner;
  }
}

/**
 * `gh` reports the API status in its error output rather than as an exit code, so
 * the one number that changes what the caller does — 404 — is read back out.
 */
function statusCodeInMessage(cause: unknown): number | null {
  const message = cause instanceof Error ? `${cause.message}` : String(cause);
  const match = /HTTP (\d{3})/.exec(message);
  const statusCode = match?.[1];
  return statusCode === undefined ? null : Number.parseInt(statusCode, 10);
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    const standardError = (cause as { stderr?: string }).stderr;
    return standardError !== undefined && standardError.trim().length > 0
      ? standardError.trim()
      : cause.message;
  }
  return String(cause);
}
