import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAccessToken, matchesAccessToken } from "../src/server/access-token.ts";

describe("createAccessToken", () => {
  it("produces a url-safe token long enough to resist guessing", () => {
    const token = createAccessToken();

    assert.match(token, /^[A-Za-z0-9_-]{43,}$/);
  });

  it("produces a different token every time", () => {
    const tokens = new Set<string>();
    for (let attempt = 0; attempt < 50; attempt += 1) {
      tokens.add(createAccessToken());
    }

    assert.equal(tokens.size, 50);
  });
});

describe("matchesAccessToken", () => {
  it("accepts the exact token", () => {
    const token = createAccessToken();

    assert.equal(matchesAccessToken(token, token), true);
  });

  it("rejects a different token of the same length", () => {
    const token = createAccessToken();
    const forgedToken = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    assert.equal(matchesAccessToken(token, forgedToken), false);
  });

  it("rejects a token of a different length", () => {
    const token = createAccessToken();

    assert.equal(matchesAccessToken(token, token.slice(0, 10)), false);
  });

  it("rejects a missing token", () => {
    const token = createAccessToken();

    assert.equal(matchesAccessToken(token, undefined), false);
    assert.equal(matchesAccessToken(token, null), false);
    assert.equal(matchesAccessToken(token, ""), false);
  });
});
