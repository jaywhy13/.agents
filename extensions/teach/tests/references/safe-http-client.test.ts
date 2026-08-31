import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RequestTimeoutError, ResponseTooLargeError } from "../../src/references/http-transport.ts";
import {
  BlockedRequestError,
  RequestTargetGuard,
} from "../../src/references/request-target-guard.ts";
import type { SafeHttpClientOptions } from "../../src/references/safe-http-client.ts";
import {
  HttpStatusError,
  SafeHttpClient,
  TooManyRedirectsError,
  UnreadableMediaTypeError,
} from "../../src/references/safe-http-client.ts";
import { FakeHostAddressResolver } from "./support/fake-host-address-resolver.ts";
import { FakeHttpTransport } from "./support/fake-http-transport.ts";

interface TestBench {
  readonly safeHttpClient: SafeHttpClient;
  readonly httpTransport: FakeHttpTransport;
  readonly hostAddressResolver: FakeHostAddressResolver;
}

function testBench(options: SafeHttpClientOptions = {}): TestBench {
  const hostAddressResolver = new FakeHostAddressResolver().answerWith(
    "example.com",
    "93.184.216.34",
  );
  const httpTransport = new FakeHttpTransport();
  return {
    hostAddressResolver,
    httpTransport,
    safeHttpClient: new SafeHttpClient(
      new RequestTargetGuard(hostAddressResolver),
      httpTransport,
      options,
    ),
  };
}

describe("SafeHttpClient.fetchDocument", () => {
  it("returns the page text and the address that answered", async () => {
    const bench = testBench();
    bench.httpTransport.respondTo("https://example.com/queues", {
      statusCode: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: "<p>A queue keeps order.</p>",
    });

    const document = await bench.safeHttpClient.fetchDocument("https://example.com/queues");

    assert.equal(document.text, "<p>A queue keeps order.</p>");
    assert.equal(document.mediaType, "text/html");
    assert.equal(document.finalUrl, "https://example.com/queues");
  });

  it("connects only to the address the guard approved", async () => {
    const bench = testBench();
    bench.httpTransport.respondTo("https://example.com/queues", {
      statusCode: 200,
      body: "text",
    });

    await bench.safeHttpClient.fetchDocument("https://example.com/queues");

    assert.deepEqual(bench.httpTransport.contactedAddresses, ["93.184.216.34"]);
  });

  it("follows a redirect to another public address", async () => {
    const bench = testBench();
    bench.hostAddressResolver.answerWith("docs.example.com", "93.184.216.35");
    bench.httpTransport
      .respondTo("https://example.com/queues", {
        statusCode: 301,
        headers: { location: "https://docs.example.com/queues" },
      })
      .respondTo("https://docs.example.com/queues", { statusCode: 200, body: "moved text" });

    const document = await bench.safeHttpClient.fetchDocument("https://example.com/queues");

    assert.equal(document.finalUrl, "https://docs.example.com/queues");
    assert.equal(document.text, "moved text");
  });

  it("checks a redirect target the same way as the first address", async () => {
    const bench = testBench();
    bench.hostAddressResolver.answerWith("internal.example.com", "10.0.0.5");
    bench.httpTransport.respondTo("https://example.com/queues", {
      statusCode: 302,
      headers: { location: "https://internal.example.com/secrets" },
    });

    await assert.rejects(
      bench.safeHttpClient.fetchDocument("https://example.com/queues"),
      (cause: unknown) => cause instanceof BlockedRequestError && cause.reason === "private",
    );
  });

  it("blocks a redirect to the cloud metadata address", async () => {
    const bench = testBench();
    bench.httpTransport.respondTo("https://example.com/queues", {
      statusCode: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data/" },
    });

    await assert.rejects(
      bench.safeHttpClient.fetchDocument("https://example.com/queues"),
      (cause: unknown) => cause instanceof BlockedRequestError && cause.reason === "cloud_metadata",
    );
  });

  it("blocks a redirect to a scheme that is not http or https", async () => {
    const bench = testBench();
    bench.httpTransport.respondTo("https://example.com/queues", {
      statusCode: 302,
      headers: { location: "file:///etc/passwd" },
    });

    await assert.rejects(
      bench.safeHttpClient.fetchDocument("https://example.com/queues"),
      (cause: unknown) =>
        cause instanceof BlockedRequestError && cause.reason === "unsupported_scheme",
    );
  });

  it("stops after the redirect limit", async () => {
    const bench = testBench({ maximumRedirects: 2 });
    for (const step of [0, 1, 2, 3]) {
      bench.httpTransport.respondTo(`https://example.com/step-${step}`, {
        statusCode: 302,
        headers: { location: `https://example.com/step-${step + 1}` },
      });
    }

    await assert.rejects(
      bench.safeHttpClient.fetchDocument("https://example.com/step-0"),
      TooManyRedirectsError,
    );
  });

  it("refuses a response that is bigger than the size limit", async () => {
    const bench = testBench({ maximumResponseBytes: 1000 });
    bench.httpTransport.respondTo("https://example.com/big", {
      statusCode: 200,
      body: "small on the wire",
      bodyByteLength: 5_000,
    });

    await assert.rejects(
      bench.safeHttpClient.fetchDocument("https://example.com/big"),
      ResponseTooLargeError,
    );
  });

  it("passes the request time limit down to the transport", async () => {
    const bench = testBench({ requestTimeoutMilliseconds: 250 });
    bench.httpTransport.respondTo("https://example.com/slow", {
      statusCode: 200,
      timesOut: true,
    });

    await assert.rejects(
      bench.safeHttpClient.fetchDocument("https://example.com/slow"),
      RequestTimeoutError,
    );
    assert.equal(bench.httpTransport.sentRequests[0]?.timeoutMilliseconds, 250);
  });

  it("refuses a content type a lesson cannot read", async () => {
    const bench = testBench();
    bench.httpTransport.respondTo("https://example.com/diagram.png", {
      statusCode: 200,
      headers: { "content-type": "image/png" },
      body: "binary",
    });

    await assert.rejects(
      bench.safeHttpClient.fetchDocument("https://example.com/diagram.png"),
      UnreadableMediaTypeError,
    );
  });

  it("reports a failing status rather than storing the error page", async () => {
    const bench = testBench();
    bench.httpTransport.respondTo("https://example.com/missing", {
      statusCode: 404,
      body: "not found",
    });

    await assert.rejects(
      bench.safeHttpClient.fetchDocument("https://example.com/missing"),
      HttpStatusError,
    );
  });
});

describe("SafeHttpClient.fetchJson", () => {
  it("parses a JSON answer", async () => {
    const bench = testBench();
    bench.httpTransport.respondTo("https://example.com/api", {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: '{"title":"A queue"}',
    });

    const answer = await bench.safeHttpClient.fetchJson("https://example.com/api");

    assert.deepEqual(answer, { title: "A queue" });
  });

  it("refuses an answer that says it is JSON but is not", async () => {
    const bench = testBench();
    bench.httpTransport.respondTo("https://example.com/api", {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: "<html>login</html>",
    });

    await assert.rejects(
      bench.safeHttpClient.fetchJson("https://example.com/api"),
      UnreadableMediaTypeError,
    );
  });
});
