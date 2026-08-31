import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { lessonBasePath } from "../shared/lesson-route.ts";
import { inspectFrontendBuild } from "../src/frontend-build.ts";
import { TeachLessonHost } from "../src/teach-lesson-host.ts";
import { FakeTeachingAgentSessionFactory } from "./support/fake-teaching-agent-session.ts";
import { LessonPageClient } from "./support/lesson-page-client.ts";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDirectory = path.join(packageDirectory, "dist", "public");

const hostsToStop: TeachLessonHost[] = [];

after(async () => {
  for (const startedHost of hostsToStop) {
    await startedHost.stop();
  }
});

async function hostServingTheBuiltPage(): Promise<TeachLessonHost> {
  const lessonHost = new TeachLessonHost({
    lessonsDirectory: path.join(await mkdtemp(path.join(tmpdir(), "teach-smoke-")), "lessons"),
    publicDirectory,
    createTeachingAgentSession: new FakeTeachingAgentSessionFactory().create,
    // An empty environment on purpose: a test must behave the same whether or not
    // the developer's own pi session has a Shopify AI Proxy credential, and no test
    // may ever be able to reach the proxy.
    environment: {},
    fetchImplementation: () => {
      throw new Error("a test must never reach the network");
    },
  });
  hostsToStop.push(lessonHost);
  return lessonHost;
}

/** Resolves an address the built page links to, the way a browser would. */
function asBrowserWouldResolve(pageUrl: string, linkedPath: string): string {
  return new URL(linkedPath, pageUrl).toString();
}

describe("the built lesson page", () => {
  it("is present and matches the source it was built from", async () => {
    const status = await inspectFrontendBuild({
      sourceDirectory: path.join(packageDirectory, "frontend"),
      publicDirectory,
      extraSourceDirectories: [path.join(packageDirectory, "shared")],
    });

    assert.equal(status.isBuilt, true, status.staleReason ?? "");
    assert.equal(status.isFresh, true, status.staleReason ?? "");
  });

  it("is served to the browser at the token route /teach prints", async () => {
    const running = await (await hostServingTheBuiltPage()).start();

    const response = await fetch(running.url);

    assert.equal(response.status, 200);
    assert.match(new URL(running.url).pathname, /^\/t\/[^/]+\/$/);
    assert.match(await response.text(), /id="lesson-root"/);
  });

  it("links to its assets relatively, so they stay inside the token route", async () => {
    const running = await (await hostServingTheBuiltPage()).start();

    const pageHtml = await (await fetch(running.url)).text();

    for (const linkedPath of linkedAssetPaths(pageHtml)) {
      assert.equal(
        linkedPath.startsWith("/"),
        false,
        `${linkedPath} is an absolute link and would fall outside the token route`,
      );
      assert.match(new URL(asBrowserWouldResolve(running.url, linkedPath)).pathname, /^\/t\//);
    }
  });

  it("serves the page script the browser resolves from the page", async () => {
    const running = await (await hostServingTheBuiltPage()).start();
    const pageHtml = await (await fetch(running.url)).text();
    const scriptPath = pageHtml.match(/src="([^"]+\.js)"/)?.[1];
    assert.ok(scriptPath, "the built page has no script");

    const response = await fetch(asBrowserWouldResolve(running.url, scriptPath));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/javascript; charset=utf-8");
  });

  it("serves the page styles the browser resolves from the page", async () => {
    const running = await (await hostServingTheBuiltPage()).start();
    const pageHtml = await (await fetch(running.url)).text();
    const stylePath = pageHtml.match(/href="([^"]+\.css)"/)?.[1];
    assert.ok(stylePath, "the built page has no stylesheet");

    const response = await fetch(asBrowserWouldResolve(running.url, stylePath));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/css; charset=utf-8");
  });

  it("opens the lesson socket the page would open, at the same token route", async () => {
    const running = await (await hostServingTheBuiltPage()).start();
    const pagePath = new URL(running.url).pathname;

    const client = await LessonPageClient.connect(
      `ws://127.0.0.1:${running.port}${lessonBasePath(pagePath)}socket`,
    );

    assert.ok(client);
    client.close();
  });

  it("answers the setup request the page would make, at the same token route", async () => {
    const running = await (await hostServingTheBuiltPage()).start();

    const response = await fetch(asBrowserWouldResolve(running.url, "api/setup"));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { suggestedTopic: null, voiceAvailable: false });
  });

  it("never hands the browser a cookie that other local programs would receive", async () => {
    const running = await (await hostServingTheBuiltPage()).start();
    const pageHtml = await (await fetch(running.url)).text();
    const scriptPath = pageHtml.match(/src="([^"]+\.js)"/)?.[1] ?? "";

    const pageResponse = await fetch(running.url);
    const scriptResponse = await fetch(asBrowserWouldResolve(running.url, scriptPath));

    assert.equal(pageResponse.headers.get("set-cookie"), null);
    assert.equal(scriptResponse.headers.get("set-cookie"), null);
  });

  it("never writes the lesson token into the built files", async () => {
    const running = await (await hostServingTheBuiltPage()).start();

    const builtFiles = await readdir(path.join(publicDirectory, "assets"));
    for (const fileName of [...builtFiles.map((name) => path.join("assets", name)), "index.html"]) {
      const content = await readFile(path.join(publicDirectory, fileName), "utf8");
      assert.equal(content.includes(running.accessToken), false, `${fileName} holds the token`);
    }
  });

  it("has no inline script or style, which the content security policy forbids", async () => {
    const running = await (await hostServingTheBuiltPage()).start();

    const pageHtml = await (await fetch(running.url)).text();

    assert.equal(/<script(?![^>]*\ssrc=)/.test(pageHtml), false);
    assert.equal(/\sstyle="/.test(pageHtml), false);
  });
});

function linkedAssetPaths(pageHtml: string): readonly string[] {
  return [...pageHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1] ?? "")
    .filter((linkedPath) => linkedPath.length > 0 && !/^[a-z]+:/i.test(linkedPath));
}
