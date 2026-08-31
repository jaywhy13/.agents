import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ProxySpeechClient } from "../../src/voice/proxy-speech-client.ts";
import {
  audioBytes,
  FakeProxyFetch,
  testProxyConfiguration,
} from "./support/fake-proxy-fetch.ts";

function clientWith(
  proxy: FakeProxyFetch,
  limits?: ConstructorParameters<typeof ProxySpeechClient>[2],
): ProxySpeechClient {
  return new ProxySpeechClient(testProxyConfiguration(), proxy.fetch, limits);
}

function sentBody(proxy: FakeProxyFetch): Record<string, unknown> {
  const body = proxy.onlyCall.init.body;
  assert.equal(typeof body, "string");
  return JSON.parse(body as string) as Record<string, unknown>;
}

describe("speaking one teaching line", () => {
  it("hands back the audio the proxy returned", async () => {
    const spokenMp3 = audioBytes(4096);
    const proxy = new FakeProxyFetch().answerWithAudio(spokenMp3);

    const spoken = await clientWith(proxy).speak({ text: "A queue holds work." });

    assert.deepEqual(spoken.audio, spokenMp3);
  });

  it("posts to the proxy's speech address", async () => {
    const proxy = new FakeProxyFetch().answerWithAudio(audioBytes(64));

    await clientWith(proxy).speak({ text: "A queue holds work." });

    assert.equal(proxy.onlyCall.url, "https://proxy.shopify.ai/vendors/openai/v1/audio/speech");
  });

  it("asks for mp3, which every browser plays without a decoder", async () => {
    const proxy = new FakeProxyFetch().answerWithAudio(audioBytes(64));

    const spoken = await clientWith(proxy).speak({ text: "A queue holds work." });

    assert.equal(sentBody(proxy)["response_format"], "mp3");
    assert.equal(spoken.mimeType, "audio/mpeg");
  });

  it("uses the configured model and voice", async () => {
    const proxy = new FakeProxyFetch().answerWithAudio(audioBytes(64));

    await clientWith(proxy).speak({ text: "A queue holds work." });

    assert.equal(sentBody(proxy)["model"], "gpt-4o-mini-tts");
    assert.equal(sentBody(proxy)["voice"], "alloy");
  });

  it("lets one line override the voice", async () => {
    const proxy = new FakeProxyFetch().answerWithAudio(audioBytes(64));

    const spoken = await clientWith(proxy).speak({ text: "A queue.", voice: "sage" });

    assert.equal(sentBody(proxy)["voice"], "sage");
    assert.equal(spoken.voice, "sage");
  });

  it("sends a speaking style only to the model that reads one", async () => {
    const proxy = new FakeProxyFetch().answerWithAudio(audioBytes(64));

    await clientWith(proxy).speak({
      text: "A queue.",
      model: "tts-1",
      speakingStyle: "calm, teaching",
    });

    assert.equal(sentBody(proxy)["instructions"], undefined);
  });

  it("trims the text before speaking it", async () => {
    const proxy = new FakeProxyFetch().answerWithAudio(audioBytes(64));

    await clientWith(proxy).speak({ text: "  A queue holds work.  " });

    assert.equal(sentBody(proxy)["input"], "A queue holds work.");
  });
});

describe("text the speech route should not be given", () => {
  it("refuses blank text, without calling the proxy", async () => {
    const proxy = new FakeProxyFetch();

    await assert.rejects(clientWith(proxy).speak({ text: "   " }), {
      name: "SpeechTextRejectedError",
    });
    assert.equal(proxy.callCount, 0);
  });

  it("refuses text longer than one narrated beat, and says to split it", async () => {
    const proxy = new FakeProxyFetch();
    const client = clientWith(proxy, {
      longestTextCharacters: 20,
      largestResponseBytes: 4096,
      timeoutMilliseconds: 1000,
    });

    await assert.rejects(client.speak({ text: "x".repeat(21) }), {
      name: "SpeechTextRejectedError",
      message: /shorter beats/,
    });
    assert.equal(proxy.callCount, 0);
  });
});

describe("when the proxy will not speak", () => {
  it("reports the status and a short excerpt of the proxy's own message", async () => {
    const proxy = new FakeProxyFetch().answerWithText("rate limited", 429);

    await assert.rejects(clientWith(proxy).speak({ text: "A queue." }), {
      name: "ProxyRequestFailedError",
      message: /429.*rate limited/,
    });
  });

  it("refuses a json error body that arrives with a success status", async () => {
    const proxy = new FakeProxyFetch().answerWithJson({ error: "no voice" });

    await assert.rejects(clientWith(proxy).speak({ text: "A queue." }), {
      name: "ProxyResponseUnreadableError",
      message: /not audio/,
    });
  });

  it("refuses empty audio rather than handing back silence", async () => {
    const proxy = new FakeProxyFetch().answerWithAudio(audioBytes(0));

    await assert.rejects(clientWith(proxy).speak({ text: "A queue." }), {
      name: "ProxyResponseUnreadableError",
      message: /empty/,
    });
  });

  it("refuses audio larger than the response limit", async () => {
    const proxy = new FakeProxyFetch().answerWithAudio(audioBytes(4096));
    const client = clientWith(proxy, {
      longestTextCharacters: 900,
      largestResponseBytes: 1024,
      timeoutMilliseconds: 1000,
    });

    await assert.rejects(client.speak({ text: "A queue." }), {
      name: "ProxyResponseTooLargeError",
    });
  });

  it("gives up on its own deadline rather than waiting for ever", async () => {
    const proxy = new FakeProxyFetch().answerWithNothing();
    const client = clientWith(proxy, {
      longestTextCharacters: 900,
      largestResponseBytes: 4096,
      timeoutMilliseconds: 25,
    });

    await assert.rejects(client.speak({ text: "A queue." }), { name: "ProxyTimedOutError" });
  });
});
