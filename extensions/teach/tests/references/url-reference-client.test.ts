import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TagStrippingHtmlTextExtractor } from "../../src/references/html-text-extractor.ts";
import type { UrlReference } from "../../src/references/reference.ts";
import { ReferenceCopyError } from "../../src/references/reference.ts";
import { RequestTargetGuard } from "../../src/references/request-target-guard.ts";
import { SafeHttpClient } from "../../src/references/safe-http-client.ts";
import { UrlReferenceClient } from "../../src/references/url-reference-client.ts";
import { FakeHostAddressResolver } from "./support/fake-host-address-resolver.ts";
import { FakeHttpTransport } from "./support/fake-http-transport.ts";

function urlReference(url: string, label = "Queue docs"): UrlReference {
  return { kind: "url", label, url };
}

interface TestBench {
  readonly urlReferenceClient: UrlReferenceClient;
  readonly httpTransport: FakeHttpTransport;
}

function testBench(): TestBench {
  const httpTransport = new FakeHttpTransport();
  const safeHttpClient = new SafeHttpClient(
    new RequestTargetGuard(new FakeHostAddressResolver().answerWith("example.com", "93.184.216.34")),
    httpTransport,
  );
  return {
    httpTransport,
    urlReferenceClient: new UrlReferenceClient(safeHttpClient, new TagStrippingHtmlTextExtractor()),
  };
}

describe("UrlReferenceClient", () => {
  it("turns a page into readable text", async () => {
    const bench = testBench();
    bench.httpTransport.respondTo("https://example.com/queues", {
      statusCode: 200,
      headers: { "content-type": "text/html" },
      body: "<html><head><title>Queues</title></head><body><p>A queue keeps order.</p></body></html>",
    });

    const content = await bench.urlReferenceClient.copy(urlReference("https://example.com/queues"));

    assert.equal(content.text, "A queue keeps order.");
    assert.equal(content.mediaType, "text/plain");
  });

  it("keeps the page title", async () => {
    const bench = testBench();
    bench.httpTransport.respondTo("https://example.com/queues", {
      statusCode: 200,
      headers: { "content-type": "text/html" },
      body: "<html><head><title>Queues</title></head><body><p>Text.</p></body></html>",
    });

    const content = await bench.urlReferenceClient.copy(urlReference("https://example.com/queues"));

    assert.equal(content.title, "Queues");
  });

  it("keeps plain text as it is", async () => {
    const bench = testBench();
    bench.httpTransport.respondTo("https://example.com/notes.txt", {
      statusCode: 200,
      headers: { "content-type": "text/plain" },
      body: "line one\nline two",
    });

    const content = await bench.urlReferenceClient.copy(
      urlReference("https://example.com/notes.txt"),
    );

    assert.equal(content.text, "line one\nline two");
  });

  it("records the address that finally answered, not the one first asked for", async () => {
    const bench = testBench();
    bench.httpTransport
      .respondTo("https://example.com/old", {
        statusCode: 301,
        headers: { location: "https://example.com/new" },
      })
      .respondTo("https://example.com/new", {
        statusCode: 200,
        headers: { "content-type": "text/plain" },
        body: "moved text",
      });

    const content = await bench.urlReferenceClient.copy(urlReference("https://example.com/old"));

    assert.equal(content.sourceUrl, "https://example.com/new");
  });

  it("reports a page with no readable words as a copy failure", async () => {
    const bench = testBench();
    bench.httpTransport.respondTo("https://example.com/empty", {
      statusCode: 200,
      headers: { "content-type": "text/html" },
      body: "<html><body><script>alert(1)</script></body></html>",
    });

    await assert.rejects(
      bench.urlReferenceClient.copy(urlReference("https://example.com/empty")),
      ReferenceCopyError,
    );
  });

  it("reports a blocked address as a copy failure that names the reference", async () => {
    const bench = testBench();

    await assert.rejects(
      bench.urlReferenceClient.copy(urlReference("http://127.0.0.1/admin", "Sneaky link")),
      (cause: unknown) =>
        cause instanceof ReferenceCopyError && cause.message.includes("Sneaky link"),
    );
  });
});
