import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { lessonRoutePath } from "../shared/lesson-route.ts";
import { LessonServerStoppedError } from "../src/server/lesson-server.ts";
import { TeachLessonHost } from "../src/teach-lesson-host.ts";
import { FakeTeachingAgentSessionFactory } from "./support/fake-teaching-agent-session.ts";
import { LessonPageClient } from "./support/lesson-page-client.ts";

const hostsToStop: TeachLessonHost[] = [];

async function host(
  sessionFactory = new FakeTeachingAgentSessionFactory(),
  // An empty environment on purpose: a test must behave the same whether or not the
  // developer's own pi session has a Shopify AI Proxy credential, and no test may
  // ever be able to reach the proxy.
  environment: Record<string, string | undefined> = {},
): Promise<TeachLessonHost> {
  const root = await mkdtemp(path.join(tmpdir(), "teach-host-"));
  const publicDirectory = path.join(root, "public");
  await mkdir(publicDirectory, { recursive: true });
  await writeFile(path.join(publicDirectory, "index.html"), "<!doctype html><title>Lesson</title>");

  const created = new TeachLessonHost({
    lessonsDirectory: path.join(root, "lessons"),
    publicDirectory,
    createTeachingAgentSession: sessionFactory.create,
    environment,
    fetchImplementation: () => {
      throw new Error("a test must never reach the network");
    },
  });
  hostsToStop.push(created);
  return created;
}

after(async () => {
  for (const startedHost of hostsToStop) {
    await startedHost.stop();
  }
});

/**
 * Voice and pictures both need the Shopify AI Proxy credential, and the pi session
 * tells the learner about them as one thing. They read the same two variables, so
 * neither can be on while the other is off.
 */
describe("TeachLessonHost and the one proxy credential", () => {
  it("has neither voice nor pictures without a credential", async () => {
    const lessonHost = await host(new FakeTeachingAgentSessionFactory(), {});

    assert.equal(lessonHost.hasVoice, false);
    assert.equal(lessonHost.canDrawPictures, false);
  });

  it("has both voice and pictures from the raw api key", async () => {
    const lessonHost = await host(new FakeTeachingAgentSessionFactory(), {
      PI_PROXY_API_KEY: "shopify-test-key",
    });

    assert.equal(lessonHost.hasVoice, true);
    assert.equal(lessonHost.canDrawPictures, true);
  });

  it("has both voice and pictures from the ready-made authorization header", async () => {
    const lessonHost = await host(new FakeTeachingAgentSessionFactory(), {
      PI_PROXY_AUTH_HEADER: "Bearer shopify-test-token",
    });

    assert.equal(lessonHost.hasVoice, true);
    assert.equal(lessonHost.canDrawPictures, true);
  });
});

describe("TeachLessonHost", () => {
  it("is not listening until it is started", async () => {
    const lessonHost = await host();

    assert.equal(lessonHost.running, null);
  });

  it("serves the lesson page on the loopback address once started", async () => {
    const lessonHost = await host();

    const running = await lessonHost.start();

    assert.match(running.url, /^http:\/\/127\.0\.0\.1:\d+\/t\/[^/]+\/$/);
    const response = await fetch(running.url);
    assert.equal(response.status, 200);
  });

  it("keeps the same address when /teach is run again", async () => {
    const lessonHost = await host();
    const firstRun = await lessonHost.start();

    const secondRun = await lessonHost.start();

    assert.equal(secondRun.url, firstRun.url);
  });

  it("offers the topic from the command to the setup form", async () => {
    const lessonHost = await host();
    const running = await lessonHost.start();

    lessonHost.setSuggestedTopic("How a message queue works");

    const response = await fetch(
      `http://127.0.0.1:${running.port}${lessonRoutePath(running.accessToken, "/api/setup")}`,
    );
    // Voice is off in a test, because the environment holds no proxy credential.
    assert.deepEqual(await response.json(), {
      suggestedTopic: "How a message queue works",
      voiceAvailable: false,
    });
  });

  it("tells an open lesson page about the new topic", async () => {
    const lessonHost = await host();
    const running = await lessonHost.start();
    const client = await LessonPageClient.connect(
      `ws://127.0.0.1:${running.port}${lessonRoutePath(running.accessToken, "/socket")}`,
    );

    lessonHost.setSuggestedTopic("How a message queue works");
    const message = await client.nextMessage();

    assert.deepEqual(message, { type: "suggested_topic", topic: "How a message queue works" });
    client.close();
  });

  it("stops listening when the pi session ends", async () => {
    const lessonHost = await host();
    const running = await lessonHost.start();

    await lessonHost.stop();

    assert.equal(lessonHost.running, null);
    await assert.rejects(() => fetch(running.url));
  });

  it("can be stopped twice, because session shutdown may fire more than once", async () => {
    const lessonHost = await host();
    await lessonHost.start();

    await lessonHost.stop();
    await lessonHost.stop();

    assert.equal(lessonHost.running, null);
  });

  it("can be stopped before it was ever started", async () => {
    const lessonHost = await host();

    await lessonHost.stop();

    assert.equal(lessonHost.running, null);
  });

  it("says so plainly rather than half starting after the pi session ended", async () => {
    const lessonHost = await host();
    await lessonHost.start();
    await lessonHost.stop();

    await assert.rejects(() => lessonHost.start(), LessonServerStoppedError);
  });

  it("lets the stop win when it lands while the server is still starting", async () => {
    const lessonHost = await host();

    const starting = lessonHost.start();
    const stopping = lessonHost.stop();

    // The stop waits for the half-open server before closing it, so nothing is
    // left listening, and the start says plainly that it was overtaken.
    await assert.rejects(() => starting, LessonServerStoppedError);
    await stopping;
    assert.equal(lessonHost.running, null);
  });

  it("closes the teaching session when the pi session ends", async () => {
    const sessionFactory = new FakeTeachingAgentSessionFactory();
    const lessonHost = await host(sessionFactory);
    const running = await lessonHost.start();
    const client = await LessonPageClient.connect(
      `ws://127.0.0.1:${running.port}${lessonRoutePath(running.accessToken, "/socket")}`,
    );
    client.send({
      type: "start_lesson",
      setup: { topic: "How a message queue works", references: [] },
    });
    await waitUntil(() => sessionFactory.createdSessions.length === 1);

    await lessonHost.stop();

    assert.equal(sessionFactory.onlySession.disposeCount, 1);
  });
});

async function waitUntil(condition: () => boolean, timeoutMilliseconds = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("The lesson host did not reach the expected state in time.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
