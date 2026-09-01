import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { GithubApiRunner, GithubCommandProbe } from "../../src/references/github-api-runner.ts";
import {
  GITHUB_API_ORIGIN,
  GithubApiError,
  GithubCommandOrPublicApiRunner,
  PublicHttpGithubApiRunner,
  requireApiPath,
} from "../../src/references/github-api-runner.ts";
import { RequestTargetGuard } from "../../src/references/request-target-guard.ts";
import { SafeHttpClient } from "../../src/references/safe-http-client.ts";
import { FakeHostAddressResolver } from "./support/fake-host-address-resolver.ts";
import { FakeHttpTransport } from "./support/fake-http-transport.ts";

describe("requireApiPath", () => {
  it("accepts an ordinary API path", () => {
    assert.equal(requireApiPath("repos/shopify/teach/issues/42"), "repos/shopify/teach/issues/42");
  });

  it("refuses a whole web address", () => {
    assert.throws(() => requireApiPath("https://github.com/shopify/teach"), GithubApiError);
  });

  it("refuses a path that would look like a command option", () => {
    assert.throws(() => requireApiPath("--method=DELETE"), GithubApiError);
  });

  it("refuses shell punctuation", () => {
    assert.throws(() => requireApiPath("repos/x/y; rm -rf /"), GithubApiError);
  });
});

describe("PublicHttpGithubApiRunner", () => {
  it("reads the public API through the guarded HTTP client", async () => {
    const httpTransport = new FakeHttpTransport().respondTo(
      `${GITHUB_API_ORIGIN}/repos/shopify/teach`,
      {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: '{"description":"A teaching extension."}',
      },
    );
    const safeHttpClient = new SafeHttpClient(
      new RequestTargetGuard(new FakeHostAddressResolver().answerWith("api.github.com", "140.82.121.6")),
      httpTransport,
    );

    const answer = await new PublicHttpGithubApiRunner(safeHttpClient).requestJson(
      "repos/shopify/teach",
    );

    assert.deepEqual(answer, { description: "A teaching extension." });
  });

  it("reports the status GitHub answered with", async () => {
    const httpTransport = new FakeHttpTransport().respondTo(
      `${GITHUB_API_ORIGIN}/repos/shopify/teach/readme`,
      { statusCode: 404, headers: { "content-type": "application/json" }, body: "{}" },
    );
    const safeHttpClient = new SafeHttpClient(
      new RequestTargetGuard(new FakeHostAddressResolver().answerWith("api.github.com", "140.82.121.6")),
      httpTransport,
    );

    await assert.rejects(
      new PublicHttpGithubApiRunner(safeHttpClient).requestJson("repos/shopify/teach/readme"),
      (cause: unknown) => cause instanceof GithubApiError && cause.statusCode === 404,
    );
  });
});

/** Records which paths it was asked for, so a test can say which runner was used. */
class RecordingGithubApiRunner implements GithubApiRunner {
  readonly requestedApiPaths: string[] = [];
  private readonly answer: unknown;

  constructor(answer: unknown) {
    this.answer = answer;
  }

  async requestJson(apiPath: string): Promise<unknown> {
    this.requestedApiPaths.push(apiPath);
    return this.answer;
  }
}

class FakeGithubCommandProbe implements GithubCommandProbe {
  probeCount = 0;
  private readonly answer: boolean | Error;

  constructor(answer: boolean | Error) {
    this.answer = answer;
  }

  async canReadGithub(): Promise<boolean> {
    this.probeCount += 1;
    if (this.answer instanceof Error) {
      throw this.answer;
    }
    return this.answer;
  }
}

function runnerWithProbe(probe: GithubCommandProbe): {
  readonly runner: GithubCommandOrPublicApiRunner;
  readonly githubCommandRunner: RecordingGithubApiRunner;
  readonly publicApiRunner: RecordingGithubApiRunner;
} {
  const githubCommandRunner = new RecordingGithubApiRunner("from the gh command");
  const publicApiRunner = new RecordingGithubApiRunner("from the public API");
  return {
    runner: new GithubCommandOrPublicApiRunner({
      githubCommandRunner,
      publicApiRunner,
      githubCommandProbe: probe,
    }),
    githubCommandRunner,
    publicApiRunner,
  };
}

describe("choosing between the learner's gh command and the public API", () => {
  it("uses the learner's gh when it can read GitHub, so private repositories work", async () => {
    const { runner, githubCommandRunner, publicApiRunner } = runnerWithProbe(
      new FakeGithubCommandProbe(true),
    );

    const answer = await runner.requestJson("repos/shopify/teach");

    assert.equal(answer, "from the gh command");
    assert.deepEqual(githubCommandRunner.requestedApiPaths, ["repos/shopify/teach"]);
    assert.deepEqual(publicApiRunner.requestedApiPaths, []);
  });

  it("falls back to the public API when gh is not installed or not signed in", async () => {
    const { runner, githubCommandRunner, publicApiRunner } = runnerWithProbe(
      new FakeGithubCommandProbe(false),
    );

    const answer = await runner.requestJson("repos/shopify/teach");

    assert.equal(answer, "from the public API");
    assert.deepEqual(publicApiRunner.requestedApiPaths, ["repos/shopify/teach"]);
    assert.deepEqual(githubCommandRunner.requestedApiPaths, []);
  });

  it("falls back to the public API when the probe itself fails", async () => {
    const { runner, publicApiRunner } = runnerWithProbe(
      new FakeGithubCommandProbe(new Error("spawn ENOENT")),
    );

    const answer = await runner.requestJson("repos/shopify/teach");

    assert.equal(answer, "from the public API");
    assert.deepEqual(publicApiRunner.requestedApiPaths, ["repos/shopify/teach"]);
  });

  it("probes once for the whole pi session, not once per reference", async () => {
    const probe = new FakeGithubCommandProbe(true);
    const { runner } = runnerWithProbe(probe);

    await runner.requestJson("repos/shopify/teach");
    await runner.requestJson("repos/shopify/teach/readme");
    await Promise.all([
      runner.requestJson("repos/shopify/teach/issues/1"),
      runner.requestJson("repos/shopify/teach/issues/2"),
    ]);

    assert.equal(probe.probeCount, 1);
  });

  it("checks the API path before it chooses a runner at all", async () => {
    const probe = new FakeGithubCommandProbe(true);
    const { runner } = runnerWithProbe(probe);

    await assert.rejects(() => runner.requestJson("https://github.com/shopify/teach"), GithubApiError);
    assert.equal(probe.probeCount, 0);
  });
});
