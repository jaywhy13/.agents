import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import type { ConceptCardBeat, MultipleChoiceQuizBeat, ShortTextQuizBeat } from "../shared/beat.ts";
import { lessonRoutePath } from "../shared/lesson-route.ts";
import type { LessonMetadata } from "../shared/lesson.ts";
import { ConnectionHub } from "../src/server/connection-hub.ts";
import {
  LessonServer,
  LessonServerStoppedError,
  type RunningLessonServer,
} from "../src/server/lesson-server.ts";
import { StaticAssetRepository } from "../src/server/static-asset-repository.ts";
import { FakeLessonConductor } from "./support/fake-lesson-conductor.ts";
import { FakeLessonImages, FakeLessonVoice } from "./support/fake-lesson-media.ts";
import { LessonPageClient } from "./support/lesson-page-client.ts";

interface StartedServer {
  readonly server: LessonServer;
  readonly running: RunningLessonServer;
  readonly conductor: FakeLessonConductor;
  readonly connectionHub: ConnectionHub;
  readonly voice: FakeLessonVoice;
  readonly images: FakeLessonImages;
}

interface StartOptions {
  readonly suggestedTopic?: string;
  /** Extra beats in the stored lesson, on top of the concept card. */
  readonly extraBeats?: readonly (MultipleChoiceQuizBeat | ShortTextQuizBeat)[];
}

const startedServers: LessonServer[] = [];

function lessonMetadata(): LessonMetadata {
  return {
    lessonId: "lesson-abc123",
    topic: "How a message queue works",
    status: "teaching",
    createdAt: "2024-05-01T10:00:00.000Z",
    updatedAt: "2024-05-01T10:00:00.000Z",
    references: [],
    beatCount: 1,
  };
}

function conceptCardBeat(): ConceptCardBeat {
  return {
    kind: "concept_card",
    beatId: "beat-1",
    lessonId: "lesson-abc123",
    sequenceNumber: 1,
    createdAt: "2024-05-01T10:00:00.000Z",
    title: "What a queue is",
    plainLanguageSummary: "A queue holds work until a worker is free.",
    keyPoints: ["Work waits in line."],
    narrationScript: "A queue holds work until a worker is free.",
    pauseForLearner: true,
  };
}

const PRIVATE_FILE_CONTENT = "this file must never reach the browser";

async function publicDirectoryWithLessonPage(): Promise<string> {
  const parentDirectory = await mkdtemp(path.join(tmpdir(), "teach-server-"));
  const publicDirectory = path.join(parentDirectory, "public");
  await mkdir(path.join(publicDirectory, "assets"), { recursive: true });
  await writeFile(path.join(publicDirectory, "index.html"), "<!doctype html><title>Lesson</title>");
  await writeFile(path.join(publicDirectory, "assets", "app.js"), "console.log('lesson');");
  await writeFile(path.join(parentDirectory, "private-notes.txt"), PRIVATE_FILE_CONTENT);
  return publicDirectory;
}

/**
 * Speaks HTTP by hand. `fetch` tidies up `..` before sending and refuses to set an
 * Origin on a socket upgrade, so neither can be tested through it.
 */
async function rawRequest(
  running: RunningLessonServer,
  requestLine: string,
  extraHeaders: readonly string[] = [],
): Promise<string> {
  const isUpgrade = extraHeaders.some((header) => /^upgrade:/i.test(header));
  return new Promise<string>((resolve, reject) => {
    const socket = connect(running.port, "127.0.0.1", () => {
      const headerLines = [
        requestLine,
        `Host: 127.0.0.1:${running.port}`,
        ...extraHeaders,
        ...(isUpgrade ? [] : ["Connection: close"]),
      ];
      socket.write(`${headerLines.join("\r\n")}\r\n\r\n`);
    });
    let response = "";
    socket.on("data", (chunk: Buffer) => {
      response += chunk.toString("utf8");
      // An accepted upgrade never ends the connection, so stop at the status line.
      if (isUpgrade && response.includes("\r\n\r\n")) {
        socket.destroy();
        resolve(response);
      }
    });
    socket.on("end", () => resolve(response));
    socket.on("error", reject);
  });
}

async function startLessonServer(
  suggestedTopicOrOptions?: string | StartOptions,
): Promise<StartedServer> {
  const options: StartOptions =
    typeof suggestedTopicOrOptions === "string"
      ? { suggestedTopic: suggestedTopicOrOptions }
      : (suggestedTopicOrOptions ?? {});

  const conductor = new FakeLessonConductor();
  conductor.transcript = {
    metadata: lessonMetadata(),
    beats: [conceptCardBeat(), ...(options.extraBeats ?? [])],
    quizAttempts: [],
    illustrations: [],
  };
  const connectionHub = new ConnectionHub();
  const voice = new FakeLessonVoice();
  const images = new FakeLessonImages();
  const server = new LessonServer({
    conductor,
    connectionHub,
    staticAssetRepository: new StaticAssetRepository(await publicDirectoryWithLessonPage()),
    voice,
    images,
    ...(options.suggestedTopic === undefined ? {} : { suggestedTopic: options.suggestedTopic }),
  });
  startedServers.push(server);
  const running = await server.start();
  return { server, running, conductor, connectionHub, voice, images };
}

function multipleChoiceQuizBeat(): MultipleChoiceQuizBeat {
  return {
    kind: "quiz",
    beatId: "beat-2",
    lessonId: "lesson-abc123",
    sequenceNumber: 2,
    createdAt: "2024-05-01T10:00:00.000Z",
    questionId: "queue-order-1",
    question: "Which item does a worker take first?",
    answerFormat: "multiple_choice",
    choices: [
      { choiceId: "a", text: "The oldest" },
      { choiceId: "b", text: "The newest" },
    ],
    correctChoiceIds: ["a"],
    explanation: "A queue is first in, first out.",
    relatedTerms: ["queue"],
  };
}

function shortTextQuizBeat(): ShortTextQuizBeat {
  return {
    kind: "quiz",
    beatId: "beat-3",
    lessonId: "lesson-abc123",
    sequenceNumber: 3,
    createdAt: "2024-05-01T10:00:00.000Z",
    questionId: "queue-order-2",
    question: "Why does a queue help?",
    answerFormat: "short_text",
    correctAnswerCriteria: "Says work waits instead of being lost.",
    explanation: "Work waits instead of being lost.",
    relatedTerms: ["queue"],
  };
}

/** An address on the server, with no lesson token at all. */
function bareUrl(running: RunningLessonServer, requestPath: string): string {
  return `http://127.0.0.1:${running.port}${requestPath}`;
}

/** The address the real lesson page uses: the token sits in the path. */
function lessonUrl(running: RunningLessonServer, lessonPath = "/"): string {
  return bareUrl(running, lessonRoutePath(running.accessToken, lessonPath));
}

function socketUrl(running: RunningLessonServer, token: string): string {
  return `ws://127.0.0.1:${running.port}${lessonRoutePath(token, "/socket")}`;
}

after(async () => {
  for (const server of startedServers) {
    await server.stop();
  }
});

describe("LessonServer address", () => {
  it("listens on the loopback address only, on a port the system picked", async () => {
    const { running } = await startLessonServer();

    assert.match(running.url, /^http:\/\/127\.0\.0\.1:\d+\/t\/[^/]+\/$/);
    assert.ok(running.port > 0);
  });

  it("puts the lesson token in the path of the address it prints", async () => {
    const { running } = await startLessonServer();

    assert.equal(new URL(running.url).pathname, `/t/${running.accessToken}/`);
    assert.equal(new URL(running.url).search, "");
  });

  it("gives every lesson server a different token", async () => {
    const first = await startLessonServer();
    const second = await startLessonServer();

    assert.notEqual(first.running.accessToken, second.running.accessToken);
  });
});

describe("LessonServer lesson page", () => {
  it("serves the lesson page at the token route it prints", async () => {
    const { running } = await startLessonServer();

    const response = await fetch(running.url);

    assert.equal(response.status, 200);
    assert.match(await response.text(), /Lesson/);
  });

  it("sends the browser to the trailing slash, so relative asset links resolve", async () => {
    const { running } = await startLessonServer();

    const response = await fetch(bareUrl(running, `/t/${running.accessToken}`), {
      redirect: "manual",
    });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), `/t/${running.accessToken}/`);
  });

  it("never sets a cookie, so the token cannot reach another program on this machine", async () => {
    const { running } = await startLessonServer();

    const pageResponse = await fetch(running.url);
    const assetResponse = await fetch(lessonUrl(running, "/assets/app.js"));

    assert.equal(pageResponse.headers.get("set-cookie"), null);
    assert.equal(assetResponse.headers.get("set-cookie"), null);
  });

  it("locks the page down with a content security policy", async () => {
    const { running } = await startLessonServer();

    const response = await fetch(running.url);

    assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  });

  it("never allows another site to read the lesson", async () => {
    const { running } = await startLessonServer();

    const response = await fetch(running.url);

    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });

  it("never lets the address leak to another site", async () => {
    const { running } = await startLessonServer();

    const response = await fetch(running.url);

    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  });

  it("refuses a request with no token", async () => {
    const { running } = await startLessonServer();

    const response = await fetch(bareUrl(running, "/"));

    assert.equal(response.status, 401);
  });

  it("refuses a request that carries the token in a cookie only", async () => {
    const { running } = await startLessonServer();

    const response = await fetch(bareUrl(running, "/assets/app.js"), {
      headers: { cookie: `teach_token=${running.accessToken}` },
    });

    assert.equal(response.status, 401);
  });

  it("refuses a request that carries the token in the query string only", async () => {
    const { running } = await startLessonServer();

    const response = await fetch(bareUrl(running, `/?token=${running.accessToken}`));

    assert.equal(response.status, 401);
  });

  it("refuses a request from another site", async () => {
    const { running } = await startLessonServer();

    const response = await fetch(running.url, {
      headers: { origin: "https://evil.example.com" },
    });

    assert.equal(response.status, 403);
  });

  it("refuses an asset request from another site, even with the right token route", async () => {
    const { running } = await startLessonServer();

    const response = await fetch(lessonUrl(running, "/assets/app.js"), {
      headers: { origin: "https://evil.example.com" },
    });

    assert.equal(response.status, 403);
  });

  it("says not found for an address the lesson page does not have", async () => {
    const { running } = await startLessonServer();

    const response = await fetch(lessonUrl(running, "/somewhere/else"));

    assert.equal(response.status, 404);
  });

  it("serves an asset asked for under the token route", async () => {
    const { running } = await startLessonServer();

    const response = await fetch(lessonUrl(running, "/assets/app.js"));

    assert.equal(response.status, 200);
  });

  it("never serves a file from outside the lesson page directory", async () => {
    const { running } = await startLessonServer();

    const response = await rawRequest(
      running,
      `GET /t/${running.accessToken}/../private-notes.txt HTTP/1.1`,
    );

    assert.equal(response.includes(PRIVATE_FILE_CONTENT), false);
  });

  it("never serves a file reached by a percent-encoded climb", async () => {
    const { running } = await startLessonServer();

    const response = await rawRequest(
      running,
      `GET /t/${running.accessToken}/assets/%2e%2e/%2e%2e/private-notes.txt HTTP/1.1`,
    );

    assert.equal(response.includes(PRIVATE_FILE_CONTENT), false);
  });
});

describe("LessonServer lesson state", () => {
  it("returns the lesson and its beats", async () => {
    const { running } = await startLessonServer();

    const response = await fetch(lessonUrl(running, "/api/lesson"));
    const transcript = (await response.json()) as { metadata: LessonMetadata; beats: unknown[] };

    assert.equal(transcript.metadata.topic, "How a message queue works");
    assert.equal(transcript.beats.length, 1);
  });

  it("refuses to return the lesson without the token", async () => {
    const { running } = await startLessonServer();

    const response = await fetch(bareUrl(running, "/api/lesson"));

    assert.equal(response.status, 401);
  });

  it("returns the lesson to a caller that sends the token as a header", async () => {
    const { running } = await startLessonServer();

    const response = await fetch(bareUrl(running, "/api/lesson"), {
      headers: { "x-teach-token": running.accessToken },
    });

    assert.equal(response.status, 200);
  });
});

describe("LessonServer setup form", () => {
  it("offers the topic the learner typed after the command", async () => {
    const { running } = await startLessonServer("How a message queue works");

    const response = await fetch(lessonUrl(running, "/api/setup"));

    assert.deepEqual(await response.json(), {
      suggestedTopic: "How a message queue works",
      voiceAvailable: true,
    });
  });

  it("offers no topic when the command was given on its own", async () => {
    const { running } = await startLessonServer();

    const response = await fetch(lessonUrl(running, "/api/setup"));

    assert.deepEqual(await response.json(), { suggestedTopic: null, voiceAvailable: true });
  });

  it("says up front when this lesson has no voice, so the page can say so", async () => {
    const { running, voice } = await startLessonServer();
    voice.isAvailable = false;

    const response = await fetch(lessonUrl(running, "/api/setup"));

    assert.deepEqual(await response.json(), { suggestedTopic: null, voiceAvailable: false });
  });

  it("refuses to say anything without the token", async () => {
    const { running } = await startLessonServer("How a message queue works");

    const response = await fetch(bareUrl(running, "/api/setup"));

    assert.equal(response.status, 401);
  });
});

describe("LessonServer lesson socket", () => {
  it("sends the lesson so far as soon as the page connects", async () => {
    const { running } = await startLessonServer();
    const client = await LessonPageClient.connect(socketUrl(running, running.accessToken));

    const message = await client.nextMessage();

    assert.equal(message.type, "lesson_state");
    client.close();
  });

  it("refuses a socket with no token", async () => {
    const { running } = await startLessonServer();

    await assert.rejects(() =>
      LessonPageClient.connect(`ws://127.0.0.1:${running.port}/socket`),
    );
  });

  it("refuses a socket opened from another site", async () => {
    const { running } = await startLessonServer();

    const response = await rawRequest(
      running,
      `GET ${lessonRoutePath(running.accessToken, "/socket")} HTTP/1.1`,
      [
        "Upgrade: websocket",
        "Connection: Upgrade",
        "Sec-WebSocket-Key: AAAAAAAAAAAAAAAAAAAAAA==",
        "Sec-WebSocket-Version: 13",
        "Origin: https://evil.example.com",
      ],
    );

    assert.match(response, /^HTTP\/1\.1 403 /);
  });

  it("accepts a socket opened from the lesson page itself", async () => {
    const { running } = await startLessonServer();

    const response = await rawRequest(
      running,
      `GET ${lessonRoutePath(running.accessToken, "/socket")} HTTP/1.1`,
      [
        "Upgrade: websocket",
        "Connection: Upgrade",
        "Sec-WebSocket-Key: AAAAAAAAAAAAAAAAAAAAAA==",
        "Sec-WebSocket-Version: 13",
        `Origin: http://127.0.0.1:${running.port}`,
      ],
    );

    assert.match(response, /^HTTP\/1\.1 101 /);
  });

  it("refuses a socket with the wrong token", async () => {
    const { running } = await startLessonServer();

    await assert.rejects(() => LessonPageClient.connect(socketUrl(running, "guessed-token")));
  });

  it("starts the lesson the learner set up", async () => {
    const { running, conductor } = await startLessonServer();
    const client = await LessonPageClient.connect(socketUrl(running, running.accessToken));
    await client.nextMessage();

    client.send({
      type: "start_lesson",
      setup: { topic: "How a message queue works", references: [] },
    });
    await waitUntil(() => conductor.startedSetups.length === 1);
    const startedState = await client.nextMessage();

    assert.equal(conductor.startedSetups[0]?.topic, "How a message queue works");
    assert.equal(startedState.type, "lesson_state");
    assert.equal(
      startedState.type === "lesson_state" ? startedState.metadata.topic : "",
      "How a message queue works",
    );
    client.close();
  });

  it("stops the lesson at once when the learner interrupts", async () => {
    const { running, conductor } = await startLessonServer();
    const client = await LessonPageClient.connect(socketUrl(running, running.accessToken));
    await client.nextMessage();

    client.send({ type: "interrupt" });
    await waitUntil(() => conductor.interruptCount === 1);

    assert.equal(conductor.interruptCount, 1);
    client.close();
  });

  it("passes a typed answer back to the lesson", async () => {
    const { running, conductor } = await startLessonServer();
    const client = await LessonPageClient.connect(socketUrl(running, running.accessToken));
    await client.nextMessage();

    client.send({ type: "answer", questionId: "question-1", text: "Because it was busy." });
    await waitUntil(() => conductor.answers.length === 1);

    assert.deepEqual(conductor.answers[0], {
      questionId: "question-1",
      text: "Because it was busy.",
    });
    client.close();
  });

  it("passes a request to be quizzed back to the lesson", async () => {
    const { running, conductor } = await startLessonServer();
    const client = await LessonPageClient.connect(socketUrl(running, running.accessToken));
    await client.nextMessage();

    client.send({ type: "request_quiz" });
    await waitUntil(() => conductor.quizRequestCount === 1);

    assert.equal(conductor.quizRequestCount, 1);
    client.close();
  });

  it("passes what the learner asked for back to the lesson", async () => {
    const { running, conductor } = await startLessonServer();
    const client = await LessonPageClient.connect(socketUrl(running, running.accessToken));
    await client.nextMessage();

    client.send({ type: "learner_signal", signal: "simpler" });
    await waitUntil(() => conductor.learnerSignals.length === 1);

    assert.deepEqual(conductor.learnerSignals, ["simpler"]);
    client.close();
  });

  it("refuses a learner signal it does not know, rather than passing it on", async () => {
    const { running, conductor } = await startLessonServer();
    const client = await LessonPageClient.connect(socketUrl(running, running.accessToken));
    await client.nextMessage();

    client.send({ type: "learner_signal", signal: "bored" } as never);
    const message = await client.nextMessage();

    assert.equal(message.type, "notice");
    assert.deepEqual(conductor.learnerSignals, []);
    client.close();
  });

  it("tells the page when a message makes no sense instead of closing the lesson", async () => {
    const { running } = await startLessonServer();
    const client = await LessonPageClient.connect(socketUrl(running, running.accessToken));
    await client.nextMessage();

    client.send({ type: "drop_database" } as never);
    const message = await client.nextMessage();

    assert.equal(message.type, "notice");
    assert.equal(message.type === "notice" && message.level, "error");
    client.close();
  });

  it("closes a socket that sends a message far larger than any answer", async () => {
    const { running } = await startLessonServer();
    const client = await LessonPageClient.connect(socketUrl(running, running.accessToken));
    await client.nextMessage();

    client.sendRaw("x".repeat(200_000));

    assert.ok(await client.waitForClose());
  });

  it("closes a socket that sends bytes instead of lesson text", async () => {
    const { running } = await startLessonServer();
    const client = await LessonPageClient.connect(socketUrl(running, running.accessToken));
    await client.nextMessage();

    client.sendRaw(new ArrayBuffer(8));

    assert.equal(await client.waitForClose(), 1003);
  });

  it("sends a new beat to the page while the lesson runs", async () => {
    const { running, connectionHub } = await startLessonServer();
    const client = await LessonPageClient.connect(socketUrl(running, running.accessToken));
    await client.nextMessage();

    connectionHub.broadcast({ type: "beat", beat: conceptCardBeat() });
    const message = await client.nextMessage();

    assert.equal(message.type, "beat");
    client.close();
  });
});

describe("LessonServer answer key", () => {
  it("never sends which choices are right over the socket", async () => {
    const { running } = await startLessonServer({ extraBeats: [multipleChoiceQuizBeat()] });
    const client = await LessonPageClient.connect(socketUrl(running, running.accessToken));

    const message = await client.nextMessage();

    // The real socket message, as bytes, not the object the server meant to send.
    assert.doesNotMatch(JSON.stringify(message), /correctChoiceIds/);
    assert.match(JSON.stringify(message), /queue-order-1/);
    client.close();
  });

  it("never sends what a written answer must say over the socket", async () => {
    const { running } = await startLessonServer({ extraBeats: [shortTextQuizBeat()] });
    const client = await LessonPageClient.connect(socketUrl(running, running.accessToken));

    const message = await client.nextMessage();

    assert.doesNotMatch(JSON.stringify(message), /correctAnswerCriteria/);
    assert.doesNotMatch(JSON.stringify(message), /Says work waits/);
    client.close();
  });

  it("strips the answer key from a beat broadcast while the lesson runs", async () => {
    const { running, connectionHub } = await startLessonServer();
    const client = await LessonPageClient.connect(socketUrl(running, running.accessToken));
    await client.nextMessage();

    connectionHub.broadcast({ type: "beat", beat: multipleChoiceQuizBeat() });
    const message = await client.nextMessage();

    assert.equal(message.type, "beat");
    assert.doesNotMatch(JSON.stringify(message), /correctChoiceIds/);
    assert.doesNotMatch(JSON.stringify(message), /correctAnswerCriteria/);
    client.close();
  });

  it("never sends the answer key from the lesson state address either", async () => {
    const { running } = await startLessonServer({
      extraBeats: [multipleChoiceQuizBeat(), shortTextQuizBeat()],
    });

    const body = await (await fetch(lessonUrl(running, "/api/lesson"))).text();

    assert.doesNotMatch(body, /correctChoiceIds|correctAnswerCriteria/);
    assert.match(body, /queue-order-1/);
  });

  it("still keeps the choices, so the learner can answer the question", async () => {
    const { running } = await startLessonServer({ extraBeats: [multipleChoiceQuizBeat()] });

    const body = await (await fetch(lessonUrl(running, "/api/lesson"))).text();

    assert.match(body, /The oldest/);
    assert.match(body, /The newest/);
  });
});

describe("LessonServer message order", () => {
  it("handles two messages sent together one after the other, never side by side", async () => {
    const { running, conductor } = await startLessonServer();
    const client = await LessonPageClient.connect(socketUrl(running, running.accessToken));
    await client.nextMessage();
    // Each handler takes a turn, so two running together would overlap.
    conductor.holdEachCall();

    client.send({ type: "continue" });
    client.send({ type: "answer", questionId: "question-1", text: "Because it was busy." });
    await waitUntil(() => conductor.callsInFlight === 1);
    conductor.releaseHeldCalls();
    await waitUntil(() => conductor.continueCount === 1 && conductor.answers.length === 1);

    assert.equal(conductor.mostCallsAtOnce, 1);
    assert.deepEqual(conductor.callOrder, ["continue", "answer"]);
    client.close();
  });

  it("keeps handling messages after one of them fails", async () => {
    const { running, conductor } = await startLessonServer();
    const client = await LessonPageClient.connect(socketUrl(running, running.accessToken));
    await client.nextMessage();
    conductor.failureToThrow = new Error("A lesson is already being taught.");

    client.send({ type: "continue" });
    await waitUntil(() => conductor.callOrder.length === 1);
    conductor.failureToThrow = null;
    client.send({ type: "continue" });
    await waitUntil(() => conductor.continueCount === 1);

    assert.equal(conductor.continueCount, 1);
    client.close();
  });
});

describe("LessonServer voice", () => {
  it("writes down a recording the page uploads", async () => {
    const { running, voice } = await startLessonServer();

    const response = await fetch(lessonUrl(running, "/api/voice/transcribe"), {
      method: "POST",
      headers: { "Content-Type": "audio/webm;codecs=opus" },
      body: new Uint8Array([1, 2, 3]),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { text: "Because it was busy." });
    assert.equal(voice.transcribeRequests[0]?.mimeType, "audio/webm;codecs=opus");
    assert.deepEqual([...(voice.transcribeRequests[0]?.audio ?? [])], [1, 2, 3]);
  });

  it("refuses a recording with no token, even though it is on this machine", async () => {
    const { running } = await startLessonServer();

    const response = await fetch(bareUrl(running, "/api/voice/transcribe"), {
      method: "POST",
      headers: { "Content-Type": "audio/webm" },
      body: new Uint8Array([1]),
    });

    assert.equal(response.status, 401);
  });

  it("refuses a recording that does not say what it is", async () => {
    const { running } = await startLessonServer();

    const response = await rawRequest(
      running,
      `POST ${lessonRoutePath(running.accessToken, "/api/voice/transcribe")} HTTP/1.1`,
      ["Content-Length: 0"],
    );

    assert.match(response, /^HTTP\/1\.1 415 /);
  });

  it("refuses a recording far larger than any answer, before reading it", async () => {
    const { running, voice } = await startLessonServer();

    const response = await fetch(lessonUrl(running, "/api/voice/transcribe"), {
      method: "POST",
      headers: { "Content-Type": "audio/webm" },
      body: new Uint8Array(9 * 1024 * 1024),
    });

    assert.equal(response.status, 413);
    assert.deepEqual(voice.transcribeRequests, []);
  });

  it("passes on a recording the proxy path refused, as something the learner can fix", async () => {
    const { running, voice } = await startLessonServer();
    voice.transcriptionOutcome = { kind: "refused", reason: "That format cannot be read." };

    const response = await fetch(lessonUrl(running, "/api/voice/transcribe"), {
      method: "POST",
      headers: { "Content-Type": "audio/aiff" },
      body: new Uint8Array([1]),
    });

    assert.equal(response.status, 415);
    assert.match(await response.text(), /cannot be read/);
  });

  it("says plainly that a lesson without a credential has no voice", async () => {
    const { running, voice } = await startLessonServer();
    voice.isAvailable = false;

    const transcribe = await fetch(lessonUrl(running, "/api/voice/transcribe"), {
      method: "POST",
      headers: { "Content-Type": "audio/webm" },
      body: new Uint8Array([1]),
    });
    const narration = await fetch(lessonUrl(running, "/api/voice/narration/beat-1"));

    assert.equal(transcribe.status, 503);
    assert.equal(narration.status, 503);
  });

  it("hands back the spoken lines of one narration beat", async () => {
    const { running, voice } = await startLessonServer();

    const response = await fetch(lessonUrl(running, "/api/voice/narration/beat-1"));
    const audio = (await response.json()) as { lines: Array<{ audioBase64: string }> };

    assert.equal(response.status, 200);
    assert.equal(audio.lines.length, 1);
    assert.equal(audio.lines[0]?.audioBase64, "SUQz");
    assert.deepEqual(voice.narrationRequests, ["beat-1"]);
  });

  it("refuses a beat id that could be a path", async () => {
    const { running, voice } = await startLessonServer();

    const response = await fetch(lessonUrl(running, "/api/voice/narration/..%2F..%2Fsecrets"));

    assert.equal(response.status, 404);
    assert.deepEqual(voice.narrationRequests, []);
  });

  it("says the beat could not be spoken rather than sending silence", async () => {
    const { running, voice } = await startLessonServer();
    voice.narrationOutcome = { kind: "failed", reason: "The proxy answered 500." };

    const response = await fetch(lessonUrl(running, "/api/voice/narration/beat-1"));

    assert.equal(response.status, 502);
    assert.match(await response.text(), /500/);
  });

  it("refuses to read out a beat this lesson does not have", async () => {
    const { running, voice } = await startLessonServer();
    voice.narrationOutcome = { kind: "unknown_beat" };

    assert.equal((await fetch(lessonUrl(running, "/api/voice/narration/beat-9"))).status, 404);
  });

  it("takes no body on any other address", async () => {
    const { running } = await startLessonServer();

    const response = await fetch(lessonUrl(running, "/api/lesson"), {
      method: "POST",
      body: "{}",
    });

    assert.equal(response.status, 405);
  });
});

describe("LessonServer picture bytes", () => {
  const ILLUSTRATION_ID = "c".repeat(64);

  it("sends a picture the lesson drew", async () => {
    const { running, images } = await startLessonServer();
    images.bytesByIllustrationId.set(ILLUSTRATION_ID, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

    const response = await fetch(lessonUrl(running, `/api/images/${ILLUSTRATION_ID}.png`));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0x89, 0x50, 0x4e, 0x47]);
  });

  it("refuses a picture with no token", async () => {
    const { running } = await startLessonServer();

    assert.equal((await fetch(bareUrl(running, `/api/images/${ILLUSTRATION_ID}.png`))).status, 401);
  });

  it("says nothing is there for a picture that has not been drawn", async () => {
    const { running } = await startLessonServer();

    assert.equal(
      (await fetch(lessonUrl(running, `/api/images/${ILLUSTRATION_ID}.png`))).status,
      404,
    );
  });

  it("refuses a name that is not a content hash, so it can never be a path", async () => {
    const { running, images } = await startLessonServer();

    const climbing = await fetch(lessonUrl(running, "/api/images/..%2F..%2Flesson.json"));
    const notAHash = await fetch(lessonUrl(running, "/api/images/holiday-photo.png"));

    assert.equal(climbing.status, 404);
    assert.equal(notAHash.status, 404);
    assert.deepEqual(images.requestedIllustrationIds, []);
  });
});

describe("LessonServer shutdown", () => {
  it("stops answering once the lesson server is stopped", async () => {
    const { server, running } = await startLessonServer();

    await server.stop();

    await assert.rejects(() => fetch(running.url));
  });

  it("says so plainly rather than half starting after it was stopped", async () => {
    const { server } = await startLessonServer();
    await server.stop();

    await assert.rejects(() => server.start(), LessonServerStoppedError);
  });

  it("closes the browser connections when the lesson server stops", async () => {
    const { server, running, connectionHub } = await startLessonServer();
    const client = await LessonPageClient.connect(socketUrl(running, running.accessToken));
    await client.nextMessage();

    await server.stop();

    assert.equal(connectionHub.connectionCount, 0);
  });
});

async function waitUntil(condition: () => boolean, timeoutMilliseconds = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("The lesson server did not reach the expected state in time.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
