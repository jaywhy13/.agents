import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LessonServerMessage } from "../shared/protocol.ts";
import type { SocketState } from "../frontend/src/lesson-connection.ts";
import {
  LessonServerConnection,
  MOST_RECONNECT_ATTEMPTS,
  reconnectWaitMilliseconds,
} from "../frontend/src/lesson-connection.ts";
import { FakeSocketWorld } from "./support/fake-lesson-web-socket.ts";

interface Harness {
  readonly connection: LessonServerConnection;
  readonly world: FakeSocketWorld;
  readonly states: SocketState[];
  readonly messages: LessonServerMessage[];
  readonly reconnectCount: () => number;
}

function harness(): Harness {
  const world = new FakeSocketWorld();
  const states: SocketState[] = [];
  const messages: LessonServerMessage[] = [];
  let reconnects = 0;

  const connection = new LessonServerConnection({
    url: "ws://127.0.0.1:4321/t/token/socket",
    createWebSocket: world.createWebSocket,
    startTimer: world.startTimer,
    onMessage: (message) => messages.push(message),
    onStateChanged: (state) => states.push(state),
    onReconnected: () => {
      reconnects += 1;
    },
  });

  return { connection, world, states, messages, reconnectCount: () => reconnects };
}

const lessonStateMessage: LessonServerMessage = {
  type: "lesson_state",
  metadata: {
    lessonId: "lesson-1",
    topic: "How a message queue works",
    status: "paused",
    createdAt: "2024-05-01T10:00:00.000Z",
    updatedAt: "2024-05-01T10:00:00.000Z",
    references: [],
    beatCount: 0,
  },
  beats: [],
  quizResults: [],
  illustrations: [],
};

describe("connecting to the lesson server", () => {
  it("opens one socket at the lesson's own address", () => {
    const { connection, world } = harness();

    connection.open();

    assert.equal(world.sockets.length, 1);
    assert.equal(world.newestSocket.connectedUrl, "ws://127.0.0.1:4321/t/token/socket");
  });

  it("says it is open once the lesson server answers", () => {
    const { connection, world, states } = harness();
    connection.open();

    world.newestSocket.reportOpen();

    assert.deepEqual(states, ["connecting", "open"]);
  });

  it("hands every message the lesson server sends to the page", () => {
    const { connection, world, messages } = harness();
    connection.open();
    world.newestSocket.reportOpen();

    world.newestSocket.reportMessage(lessonStateMessage);

    assert.deepEqual(messages, [lessonStateMessage]);
  });

  it("sends what the page asks it to, once", () => {
    const { connection, world } = harness();
    connection.open();
    world.newestSocket.reportOpen();

    connection.send({ type: "continue" });

    assert.deepEqual(world.newestSocket.sentMessages, ['{"type":"continue"}']);
  });

  it("drops a message rather than sending it down a socket that is not open", () => {
    const { connection, world } = harness();
    connection.open();

    connection.send({ type: "continue" });

    assert.deepEqual(world.newestSocket.sentMessages, []);
  });
});

describe("reconnecting after the lesson server drops the socket", () => {
  it("tries again rather than giving up on the first close", () => {
    const { connection, world, states } = harness();
    connection.open();
    world.newestSocket.reportOpen();

    world.newestSocket.reportClose();

    assert.deepEqual(states, ["connecting", "open", "connecting"]);
    world.waitForTheNextAttempt();
    assert.equal(world.sockets.length, 2);
  });

  it("waits longer before each attempt, up to a ceiling", () => {
    const { connection, world } = harness();
    connection.open();
    world.newestSocket.reportOpen();

    for (let attempt = 0; attempt < MOST_RECONNECT_ATTEMPTS; attempt += 1) {
      world.newestSocket.reportClose();
      world.waitForTheNextAttempt();
    }

    const waits = world.waitedMilliseconds;
    assert.equal(waits.length, MOST_RECONNECT_ATTEMPTS);
    for (const [attempt, wait] of waits.entries()) {
      assert.equal(wait, reconnectWaitMilliseconds(attempt + 1));
    }
    for (let index = 1; index < waits.length; index += 1) {
      assert.ok((waits[index] ?? 0) >= (waits[index - 1] ?? 0));
    }
  });

  it("gives up and says the lesson server is gone rather than retrying for ever", () => {
    const { connection, world, states } = harness();
    connection.open();
    world.newestSocket.reportOpen();

    for (let attempt = 0; attempt < MOST_RECONNECT_ATTEMPTS; attempt += 1) {
      world.newestSocket.reportClose();
      world.waitForTheNextAttempt();
    }
    world.newestSocket.reportClose();

    assert.equal(states[states.length - 1], "closed");
    assert.equal(world.sockets.length, MOST_RECONNECT_ATTEMPTS + 1);
    assert.equal(world.waitedMilliseconds.length, MOST_RECONNECT_ATTEMPTS);
  });

  it("takes its listeners off the old socket, so no message is applied twice", () => {
    const { connection, world, messages } = harness();
    connection.open();
    world.newestSocket.reportOpen();
    const droppedSocket = world.newestSocket;

    droppedSocket.reportClose();
    world.waitForTheNextAttempt();
    world.newestSocket.reportOpen();
    droppedSocket.reportMessage(lessonStateMessage);
    world.newestSocket.reportMessage(lessonStateMessage);

    assert.equal(droppedSocket.listenerCount, 0);
    assert.equal(messages.length, 1);
  });

  it("sends down the new socket and not the one that went away", () => {
    const { connection, world } = harness();
    connection.open();
    world.newestSocket.reportOpen();
    const droppedSocket = world.newestSocket;
    droppedSocket.reportClose();
    world.waitForTheNextAttempt();
    world.newestSocket.reportOpen();

    connection.send({ type: "continue" });

    assert.deepEqual(droppedSocket.sentMessages, []);
    assert.deepEqual(world.newestSocket.sentMessages, ['{"type":"continue"}']);
  });

  it("tells the page to start its lesson state again once a reconnect lands", () => {
    const { connection, world, reconnectCount } = harness();
    connection.open();
    world.newestSocket.reportOpen();
    assert.equal(reconnectCount(), 0);

    world.newestSocket.reportClose();
    world.waitForTheNextAttempt();
    world.newestSocket.reportOpen();

    assert.equal(reconnectCount(), 1);
  });

  it("starts the waiting again from the shortest wait after a reconnect lands", () => {
    const { connection, world } = harness();
    connection.open();
    world.newestSocket.reportOpen();

    world.newestSocket.reportClose();
    world.waitForTheNextAttempt();
    world.newestSocket.reportClose();
    world.waitForTheNextAttempt();
    world.newestSocket.reportOpen();
    world.newestSocket.reportClose();

    assert.deepEqual(world.waitedMilliseconds, [
      reconnectWaitMilliseconds(1),
      reconnectWaitMilliseconds(2),
      reconnectWaitMilliseconds(1),
    ]);
  });
});

describe("closing the lesson page's connection on purpose", () => {
  it("does not try to reconnect after the page closes it", () => {
    const { connection, world, states } = harness();
    connection.open();
    world.newestSocket.reportOpen();

    connection.close();
    world.newestSocket.reportClose();

    assert.equal(world.sockets.length, 1);
    assert.deepEqual(world.waitedMilliseconds, []);
    assert.equal(states[states.length - 1], "closed");
  });

  it("takes its listeners off the socket it closed", () => {
    const { connection, world } = harness();
    connection.open();
    world.newestSocket.reportOpen();

    connection.close();

    assert.equal(world.newestSocket.listenerCount, 0);
    assert.equal(world.newestSocket.closeCount, 1);
  });

  it("cancels a reconnect that had already been scheduled", () => {
    const { connection, world } = harness();
    connection.open();
    world.newestSocket.reportOpen();
    world.newestSocket.reportClose();

    connection.close();
    world.waitForTheNextAttempt();

    assert.equal(world.sockets.length, 1);
  });

  it("opens nothing more when the page closes it twice", () => {
    const { connection, world } = harness();
    connection.open();

    connection.close();
    connection.close();
    connection.open();

    assert.equal(world.sockets.length, 1);
  });
});

describe("what the lesson page does with a message it cannot read", () => {
  it("passes over a message that is not JSON rather than falling over", () => {
    const { connection, world, messages } = harness();
    connection.open();
    world.newestSocket.reportOpen();

    assert.doesNotThrow(() => {
      world.newestSocket.reportMessage(undefined);
    });
    assert.deepEqual(messages, []);
  });
});
