import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ProxyTranscriptionClient } from "../../src/voice/proxy-transcription-client.ts";
import type { TranscriptionRequest } from "../../src/voice/proxy-transcription-client.ts";
import {
  audioBytes,
  FakeProxyFetch,
  testProxyConfiguration,
} from "./support/fake-proxy-fetch.ts";

function webmRecording(overrides: Partial<TranscriptionRequest> = {}): TranscriptionRequest {
  return { audio: audioBytes(2048), mimeType: "audio/webm;codecs=opus", ...overrides };
}

function clientWith(
  proxy: FakeProxyFetch,
  limits?: ConstructorParameters<typeof ProxyTranscriptionClient>[2],
): ProxyTranscriptionClient {
  return new ProxyTranscriptionClient(testProxyConfiguration(), proxy.fetch, limits);
}

async function uploadFrom(proxy: FakeProxyFetch): Promise<FormData> {
  const body = proxy.onlyCall.init.body;
  assert.ok(body instanceof FormData, "The upload must be multipart form data.");
  return body;
}

describe("transcribing a browser recording", () => {
  it("returns the words the proxy heard", async () => {
    const proxy = new FakeProxyFetch().answerWithJson({ text: "  a queue holds work  " });

    const transcript = await clientWith(proxy).transcribe(webmRecording());

    assert.equal(transcript.text, "a queue holds work");
  });

  it("posts to the proxy's transcription address", async () => {
    const proxy = new FakeProxyFetch().answerWithJson({ text: "hello" });

    await clientWith(proxy).transcribe(webmRecording());

    assert.equal(
      proxy.onlyCall.url,
      "https://proxy.shopify.ai/vendors/openai/v1/audio/transcriptions",
    );
  });

  it("sends the credential and nothing else that identifies the learner", async () => {
    const proxy = new FakeProxyFetch().answerWithJson({ text: "hello" });

    await clientWith(proxy).transcribe(webmRecording());

    assert.equal(proxy.onlyCall.init.headers["Authorization"], "Bearer test-credential");
  });

  it("lets the runtime set the multipart content type, so the boundary is right", async () => {
    const proxy = new FakeProxyFetch().answerWithJson({ text: "hello" });

    await clientWith(proxy).transcribe(webmRecording());

    assert.equal(proxy.onlyCall.init.headers["Content-Type"], undefined);
  });

  it("asks for the transcription model the lesson was built against", async () => {
    const proxy = new FakeProxyFetch().answerWithJson({ text: "hello" });

    await clientWith(proxy).transcribe(webmRecording());

    assert.equal((await uploadFrom(proxy)).get("model"), "gpt-4o-mini-transcribe");
  });

  it("names the upload with the extension that matches the container", async () => {
    const proxy = new FakeProxyFetch().answerWithJson({ text: "hello" });

    await clientWith(proxy).transcribe(webmRecording({ mimeType: "audio/mp4" }));

    const uploadedFile = (await uploadFrom(proxy)).get("file");
    assert.ok(uploadedFile instanceof File);
    assert.equal(uploadedFile.name, "learner-answer.mp4");
  });

  it("keeps the codec parameters out of the uploaded file's type", async () => {
    const proxy = new FakeProxyFetch().answerWithJson({ text: "hello" });

    await clientWith(proxy).transcribe(webmRecording());

    const uploadedFile = (await uploadFrom(proxy)).get("file");
    assert.ok(uploadedFile instanceof File);
    assert.equal(uploadedFile.type, "audio/webm");
  });

  it("sends a language hint only when there is one", async () => {
    const proxy = new FakeProxyFetch().answerWithJson({ text: "hello" });

    await clientWith(proxy).transcribe(webmRecording({ languageHint: "en" }));

    assert.equal((await uploadFrom(proxy)).get("language"), "en");
  });
});

describe("audio the transcription route cannot take", () => {
  it("refuses a container the route does not decode, without calling the proxy", async () => {
    const proxy = new FakeProxyFetch();

    await assert.rejects(
      clientWith(proxy).transcribe(webmRecording({ mimeType: "audio/aiff" })),
      { name: "UnsupportedAudioFormatError" },
    );
    assert.equal(proxy.callCount, 0);
  });

  it("refuses an empty recording, without calling the proxy", async () => {
    const proxy = new FakeProxyFetch();

    await assert.rejects(clientWith(proxy).transcribe(webmRecording({ audio: audioBytes(0) })), {
      name: "AudioSizeRejectedError",
    });
    assert.equal(proxy.callCount, 0);
  });

  it("refuses a recording over the upload limit, without calling the proxy", async () => {
    const proxy = new FakeProxyFetch();
    const client = clientWith(proxy, {
      largestUploadBytes: 1024,
      largestResponseBytes: 4096,
      timeoutMilliseconds: 1000,
    });

    await assert.rejects(client.transcribe(webmRecording({ audio: audioBytes(2048) })), {
      name: "AudioSizeRejectedError",
    });
    assert.equal(proxy.callCount, 0);
  });
});

describe("when the proxy will not transcribe", () => {
  it("reports the status and a short excerpt of the proxy's own message", async () => {
    const proxy = new FakeProxyFetch().answerWithText('{"error":"model overloaded"}', 503);

    await assert.rejects(clientWith(proxy).transcribe(webmRecording()), {
      name: "ProxyRequestFailedError",
      message: /503.*model overloaded/,
    });
  });

  it("refuses an answer larger than the response limit", async () => {
    const proxy = new FakeProxyFetch().answerWithJson({ text: "x".repeat(5000) });
    const client = clientWith(proxy, {
      largestUploadBytes: 1024 * 1024,
      largestResponseBytes: 512,
      timeoutMilliseconds: 1000,
    });

    await assert.rejects(client.transcribe(webmRecording()), {
      name: "ProxyResponseTooLargeError",
    });
  });

  it("reports an answer that is not a transcript rather than returning empty words", async () => {
    const proxy = new FakeProxyFetch().answerWithJson({ chunks: ["a queue"] });

    await assert.rejects(clientWith(proxy).transcribe(webmRecording()), {
      name: "ProxyResponseUnreadableError",
      message: /no text field/,
    });
  });

  it("gives up on its own deadline rather than waiting for ever", async () => {
    const proxy = new FakeProxyFetch().answerWithNothing();
    const client = clientWith(proxy, {
      largestUploadBytes: 1024 * 1024,
      largestResponseBytes: 4096,
      timeoutMilliseconds: 25,
    });

    await assert.rejects(client.transcribe(webmRecording()), { name: "ProxyTimedOutError" });
  });
});
