import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";

import { readRequestBody } from "../src/server/request-body.ts";

/**
 * A request body is a readable stream with headers. A `PassThrough` is one, so the
 * limits can be driven exactly — including the case where a body is declared small
 * and then keeps arriving.
 */
function incomingBody(headers: Record<string, string> = {}): IncomingMessage & PassThrough {
  const stream = new PassThrough() as PassThrough & { headers: Record<string, string> };
  stream.headers = headers;
  return stream as unknown as IncomingMessage & PassThrough;
}

const GENEROUS = { largestBytes: 1_000, timeoutMilliseconds: 1_000 } as const;

describe("readRequestBody", () => {
  it("reads a body that is within the budget", async () => {
    const request = incomingBody();
    const reading = readRequestBody(request, GENEROUS);
    request.end(Buffer.from([1, 2, 3]));

    const outcome = await reading;

    assert.equal(outcome.kind, "read");
    assert.deepEqual([...(outcome.kind === "read" ? outcome.bytes : [])], [1, 2, 3]);
  });

  it("refuses a declared length over the budget before a byte is read", async () => {
    const request = incomingBody({ "content-length": "5000" });

    const outcome = await readRequestBody(request, GENEROUS);

    assert.deepEqual(outcome, { kind: "too_large", limitBytes: 1_000 });
  });

  it("stops a body that lies about its length once it passes the budget", async () => {
    const request = incomingBody({ "content-length": "10" });
    const reading = readRequestBody(request, { largestBytes: 16, timeoutMilliseconds: 1_000 });
    request.write(Buffer.alloc(10));
    request.write(Buffer.alloc(10));

    const outcome = await reading;

    assert.equal(outcome.kind, "too_large");
  });

  it("gives up on a body that stops arriving", async () => {
    const request = incomingBody();
    // Written but never ended, which is a stalled upload.
    const reading = readRequestBody(request, { largestBytes: 1_000, timeoutMilliseconds: 20 });
    request.write(Buffer.from([1]));

    const outcome = await reading;

    assert.equal(outcome.kind, "timed_out");
  });

  it("reports a broken connection rather than waiting for the deadline", async () => {
    const request = incomingBody();
    const reading = readRequestBody(request, GENEROUS);
    request.destroy(new Error("the connection went away"));

    const outcome = await reading;

    assert.equal(outcome.kind, "failed");
  });

  it("reads an empty body as an empty body, not as a failure", async () => {
    const request = incomingBody();
    const reading = readRequestBody(request, GENEROUS);
    request.end();

    const outcome = await reading;

    assert.equal(outcome.kind, "read");
    assert.equal(outcome.kind === "read" ? outcome.bytes.byteLength : -1, 0);
  });
});
