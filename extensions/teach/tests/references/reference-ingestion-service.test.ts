import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { base64Content } from "./support/fake-github-api-runner.ts";
import { ingestionTestBench } from "./support/reference-factories.ts";

describe("ReferenceIngestionService.copy", () => {
  it("copies pasted text and keeps it under the lesson", async () => {
    const bench = await ingestionTestBench();

    const reference = await bench.referenceIngestionService.copy("lesson-abc123", {
      kind: "pasted",
      label: "My notes",
      value: "A queue keeps order.",
    });

    assert.equal(
      await bench.referenceRepository.readContent("lesson-abc123", reference.referenceId),
      "A queue keeps order.",
    );
  });

  it("copies a web page into local storage rather than keeping only the address", async () => {
    const bench = await ingestionTestBench();
    bench.hostAddressResolver.answerWith("example.com", "93.184.216.34");
    bench.httpTransport.respondTo("https://example.com/queues", {
      statusCode: 200,
      headers: { "content-type": "text/html" },
      body: "<html><body><p>A queue keeps order.</p></body></html>",
    });

    const reference = await bench.referenceIngestionService.copy("lesson-abc123", {
      kind: "url",
      label: "Queue docs",
      value: "https://example.com/queues",
    });

    assert.equal(
      await bench.referenceRepository.readContent("lesson-abc123", reference.referenceId),
      "A queue keeps order.",
    );
  });

  it("records where a copied page came from", async () => {
    const bench = await ingestionTestBench();
    bench.hostAddressResolver.answerWith("example.com", "93.184.216.34");
    bench.httpTransport.respondTo("https://example.com/queues", {
      statusCode: 200,
      headers: { "content-type": "text/plain" },
      body: "A queue keeps order.",
    });

    const reference = await bench.referenceIngestionService.copy("lesson-abc123", {
      kind: "url",
      label: "Queue docs",
      value: "https://example.com/queues",
    });

    assert.equal(reference.sourceUrl, "https://example.com/queues");
  });

  it("sends a github.com link to the GitHub client", async () => {
    const bench = await ingestionTestBench();
    bench.githubApiRunner.answerWith("repos/shopify/teach/contents/README.md?ref=main", {
      ...base64Content("# Teach\n"),
    });

    const reference = await bench.referenceIngestionService.copy("lesson-abc123", {
      kind: "url",
      label: "The readme",
      value: "https://github.com/shopify/teach/blob/main/README.md",
    });

    assert.equal(reference.kind, "github");
    assert.equal(
      await bench.referenceRepository.readContent("lesson-abc123", reference.referenceId),
      "# Teach\n",
    );
  });

  it("records how big the copy is so a reader knows what to expect", async () => {
    const bench = await ingestionTestBench();

    const reference = await bench.referenceIngestionService.copy("lesson-abc123", {
      kind: "pasted",
      label: "My notes",
      value: "one\ntwo\nthree",
    });

    assert.equal(reference.lineCount, 3);
    assert.equal(reference.byteLength, Buffer.byteLength("one\ntwo\nthree", "utf8"));
  });

  it("never fetches a private address", async () => {
    const bench = await ingestionTestBench();

    await assert.rejects(
      bench.referenceIngestionService.copy("lesson-abc123", {
        kind: "url",
        label: "Router",
        value: "http://192.168.1.1/status",
      }),
    );
    assert.deepEqual(bench.httpTransport.sentRequests, []);
  });
});

describe("ReferenceIngestionService.copyAll", () => {
  it("reports one outcome for each reference", async () => {
    const bench = await ingestionTestBench();

    const outcomes = await bench.referenceIngestionService.copyAll("lesson-abc123", [
      { kind: "pasted", label: "First notes", value: "one" },
      { kind: "pasted", label: "Second notes", value: "two" },
    ]);

    assert.deepEqual(
      outcomes.map((outcome) => outcome.status),
      ["copied", "copied"],
    );
  });

  it("keeps copying after one reference fails", async () => {
    const bench = await ingestionTestBench();

    const outcomes = await bench.referenceIngestionService.copyAll("lesson-abc123", [
      { kind: "url", label: "Router", value: "http://127.0.0.1/admin" },
      { kind: "pasted", label: "My notes", value: "A queue keeps order." },
    ]);

    assert.deepEqual(
      outcomes.map((outcome) => outcome.status),
      ["failed", "copied"],
    );
  });

  it("names the reference that failed so the learner can be told which one", async () => {
    const bench = await ingestionTestBench();

    const outcomes = await bench.referenceIngestionService.copyAll("lesson-abc123", [
      { kind: "url", label: "Router", value: "http://127.0.0.1/admin" },
    ]);

    const firstOutcome = outcomes[0];
    assert.equal(firstOutcome?.status, "failed");
    assert.equal(firstOutcome?.status === "failed" ? firstOutcome.label : null, "Router");
  });

  it("stores every reference that did work", async () => {
    const bench = await ingestionTestBench();

    await bench.referenceIngestionService.copyAll("lesson-abc123", [
      { kind: "pasted", label: "First notes", value: "one" },
      { kind: "url", label: "Router", value: "http://10.0.0.1/" },
      { kind: "pasted", label: "Second notes", value: "two" },
    ]);

    const stored = await bench.referenceRepository.list("lesson-abc123");
    assert.deepEqual(
      stored.map((reference) => reference.label),
      ["First notes", "Second notes"],
    );
  });
});
