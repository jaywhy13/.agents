import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lessonRoutePath } from "../shared/lesson-route.ts";
import { RequestGuard, securityResponseHeaders } from "../src/server/request-guard.ts";

const ACCESS_TOKEN = "token-for-tests-only";
const PORT = 51234;

function guard(): RequestGuard {
  return new RequestGuard({ accessToken: ACCESS_TOKEN, port: PORT });
}

function loopbackHeaders(overrides: Record<string, string> = {}): Record<string, string> {
  return { host: `127.0.0.1:${PORT}`, ...overrides };
}

describe("RequestGuard token check", () => {
  it("accepts the token from the lesson route the page was served from", () => {
    const decision = guard().check({
      headers: loopbackHeaders(),
      requestUrl: lessonRoutePath(ACCESS_TOKEN, "/assets/app.js"),
    });

    assert.equal(decision.allowed, true);
  });

  it("hands back the path below the lesson route, so the token never reaches routing", () => {
    const decision = guard().check({
      headers: loopbackHeaders(),
      requestUrl: lessonRoutePath(ACCESS_TOKEN, "/assets/app.js"),
    });

    assert.equal(decision.allowed === true && decision.lessonPath, "/assets/app.js");
  });

  it("accepts the token from the request header, for a caller that is not the page", () => {
    const decision = guard().check({
      headers: loopbackHeaders({ "x-teach-token": ACCESS_TOKEN }),
      requestUrl: "/api/lesson",
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.allowed === true && decision.lessonPath, "/api/lesson");
  });

  it("refuses a request with no token", () => {
    const decision = guard().check({ headers: loopbackHeaders(), requestUrl: "/api/lesson" });

    assert.equal(decision.allowed, false);
    assert.equal(decision.allowed === false && decision.statusCode, 401);
  });

  it("refuses a request with the wrong token in the lesson route", () => {
    const decision = guard().check({
      headers: loopbackHeaders(),
      requestUrl: lessonRoutePath("guessed-token", "/api/lesson"),
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.allowed === false && decision.statusCode, 401);
  });

  it("refuses a request with the wrong token in the header", () => {
    const decision = guard().check({
      headers: loopbackHeaders({ "x-teach-token": "guessed-token" }),
      requestUrl: "/api/lesson",
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.allowed === false && decision.statusCode, 401);
  });

  it("never accepts a cookie, because a loopback cookie reaches every local port", () => {
    const decision = guard().check({
      headers: loopbackHeaders({ cookie: `teach_token=${ACCESS_TOKEN}` }),
      requestUrl: "/assets/app.js",
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.allowed === false && decision.statusCode, 401);
  });

  it("never accepts the token from the query string", () => {
    const decision = guard().check({
      headers: loopbackHeaders(),
      requestUrl: `/api/lesson?token=${ACCESS_TOKEN}`,
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.allowed === false && decision.statusCode, 401);
  });

  it("asks for a trailing slash when the lesson route has none", () => {
    const decision = guard().check({
      headers: loopbackHeaders(),
      requestUrl: `/t/${ACCESS_TOKEN}`,
    });

    assert.equal(decision.allowed === true && decision.needsTrailingSlash, true);
  });
});

describe("RequestGuard origin check", () => {
  it("accepts the loopback origin the lesson page is served from", () => {
    const decision = guard().check({
      headers: loopbackHeaders({ origin: `http://127.0.0.1:${PORT}` }),
      requestUrl: lessonRoutePath(ACCESS_TOKEN, "/api/lesson"),
    });

    assert.equal(decision.allowed, true);
  });

  it("refuses a foreign origin before it looks at the token", () => {
    const decision = guard().check({
      headers: loopbackHeaders({ origin: "https://evil.example.com" }),
      requestUrl: lessonRoutePath(ACCESS_TOKEN, "/api/lesson"),
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.allowed === false && decision.statusCode, 403);
  });

  it("refuses a loopback origin on another port", () => {
    const decision = guard().check({
      headers: loopbackHeaders({ origin: `http://127.0.0.1:${PORT + 1}` }),
      requestUrl: lessonRoutePath(ACCESS_TOKEN, "/api/lesson"),
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.allowed === false && decision.statusCode, 403);
  });

  it("refuses a host header that is not loopback, which blocks domain name rebinding", () => {
    const decision = guard().check({
      headers: { host: `attacker.example.com:${PORT}` },
      requestUrl: lessonRoutePath(ACCESS_TOKEN, "/api/lesson"),
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.allowed === false && decision.statusCode, 403);
  });
});

describe("securityResponseHeaders", () => {
  it("never grants cross origin access", () => {
    const headers = securityResponseHeaders(PORT);

    const headerNames = Object.keys(headers).map((name) => name.toLowerCase());
    for (const headerName of headerNames) {
      assert.equal(headerName.startsWith("access-control-allow-"), false);
    }
  });

  it("never sets a cookie", () => {
    const headerNames = Object.keys(securityResponseHeaders(PORT)).map((name) =>
      name.toLowerCase(),
    );

    assert.equal(headerNames.includes("set-cookie"), false);
  });

  it("locks the page down with a content security policy", () => {
    const headers = securityResponseHeaders(PORT);
    const policy = headers["Content-Security-Policy"];

    assert.ok(policy);
    assert.match(policy, /default-src 'none'/);
    assert.match(policy, /script-src 'self'/);
    assert.match(policy, /frame-ancestors 'none'/);
    assert.match(policy, new RegExp(`connect-src 'self' ws://127\\.0\\.0\\.1:${PORT}`));
  });

  it("stops the browser from guessing content types or leaking the address", () => {
    const headers = securityResponseHeaders(PORT);

    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.equal(headers["Referrer-Policy"], "no-referrer");
  });
});
