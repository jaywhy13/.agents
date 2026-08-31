import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, describe, it } from "node:test";

import {
  NodeHttpTransport,
  RequestTimeoutError,
  ResponseTooLargeError,
} from "../../src/references/http-transport.ts";

type RequestHandler = (
  request: http.IncomingMessage,
  response: http.ServerResponse,
) => void;

interface RunningServer {
  readonly port: number;
  readonly receivedHostHeaders: string[];
}

const runningServers: http.Server[] = [];

after(async () => {
  for (const server of runningServers) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

/**
 * A server on the loopback address, so the transport is exercised over a real
 * socket. Nothing here leaves the machine, and the address checks that would
 * refuse loopback live in the guard above the transport, not in the transport.
 */
async function localServer(handle: RequestHandler): Promise<RunningServer> {
  const receivedHostHeaders: string[] = [];
  const server = http.createServer((request, response) => {
    receivedHostHeaders.push(request.headers.host ?? "");
    handle(request, response);
  });
  runningServers.push(server);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { port: (server.address() as AddressInfo).port, receivedHostHeaders };
}

describe("NodeHttpTransport", () => {
  it("returns the status, headers and body of the answer", async () => {
    const server = await localServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("A queue keeps order.");
    });

    const answer = await new NodeHttpTransport().send({
      url: new URL(`http://127.0.0.1:${server.port}/queues`),
      addresses: [{ address: "127.0.0.1", family: 4 }],
      headers: { accept: "text/plain" },
      timeoutMilliseconds: 5_000,
      maximumBodyBytes: 1_000_000,
    });

    assert.equal(answer.statusCode, 200);
    assert.equal(answer.headers["content-type"], "text/plain");
    assert.equal(Buffer.from(answer.body).toString("utf8"), "A queue keeps order.");
  });

  it("connects to the approved address while still using the original host name", async () => {
    const server = await localServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("pinned");
    });

    await new NodeHttpTransport().send({
      url: new URL(`http://pinned.example:${server.port}/`),
      addresses: [{ address: "127.0.0.1", family: 4 }],
      headers: {},
      timeoutMilliseconds: 5_000,
      maximumBodyBytes: 1_000_000,
    });

    assert.deepEqual(server.receivedHostHeaders, [`pinned.example:${server.port}`]);
  });

  it("does not follow a redirect on its own", async () => {
    const server = await localServer((_request, response) => {
      response.writeHead(302, { location: "http://elsewhere.example/" });
      response.end();
    });

    const answer = await new NodeHttpTransport().send({
      url: new URL(`http://127.0.0.1:${server.port}/old`),
      addresses: [{ address: "127.0.0.1", family: 4 }],
      headers: {},
      timeoutMilliseconds: 5_000,
      maximumBodyBytes: 1_000_000,
    });

    assert.equal(answer.statusCode, 302);
    assert.equal(answer.headers["location"], "http://elsewhere.example/");
  });

  it("stops reading a response that is over the size limit", async () => {
    const server = await localServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("z".repeat(50_000));
    });

    await assert.rejects(
      new NodeHttpTransport().send({
        url: new URL(`http://127.0.0.1:${server.port}/big`),
        addresses: [{ address: "127.0.0.1", family: 4 }],
        headers: {},
        timeoutMilliseconds: 5_000,
        maximumBodyBytes: 1_000,
      }),
      ResponseTooLargeError,
    );
  });

  it("gives up on a server that never answers", async () => {
    const server = await localServer(() => {
      // Never answers, which is what the time limit is for.
    });

    await assert.rejects(
      new NodeHttpTransport().send({
        url: new URL(`http://127.0.0.1:${server.port}/slow`),
        addresses: [{ address: "127.0.0.1", family: 4 }],
        headers: {},
        timeoutMilliseconds: 150,
        maximumBodyBytes: 1_000_000,
      }),
      RequestTimeoutError,
    );
  });
});
