import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasProxyCredential,
  MissingProxyCredentialError,
  readProxyCredential,
  requireProxyCredential,
} from "../../src/proxy/shopify-proxy-credential.ts";

describe("reading the one Shopify AI Proxy credential", () => {
  it("uses the ready-made authorization header pi exports, verbatim", () => {
    const environment = { PI_PROXY_AUTH_HEADER: "Bearer shopify-token" };

    assert.equal(readProxyCredential(environment), "Bearer shopify-token");
  });

  it("wraps a bare api key in a Bearer header", () => {
    const environment = { PI_PROXY_API_KEY: "shopify-key" };

    assert.equal(readProxyCredential(environment), "Bearer shopify-key");
  });

  it("prefers the header over the key when pi exports both", () => {
    const environment = {
      PI_PROXY_AUTH_HEADER: "Bearer shopify-token",
      PI_PROXY_API_KEY: "shopify-key",
    };

    assert.equal(readProxyCredential(environment), "Bearer shopify-token");
  });

  it("leaves the surrounding whitespace of a copied credential out", () => {
    const environment = { PI_PROXY_API_KEY: "  shopify-key\n" };

    assert.equal(readProxyCredential(environment), "Bearer shopify-key");
  });

  it("treats a blank header as no credential, and falls back to the key", () => {
    const environment = { PI_PROXY_AUTH_HEADER: "   ", PI_PROXY_API_KEY: "shopify-key" };

    assert.equal(readProxyCredential(environment), "Bearer shopify-key");
  });

  it("reports no credential when neither variable is set", () => {
    assert.equal(readProxyCredential({ PATH: "/usr/bin" }), null);
  });

  it("reports no credential when both variables are blank", () => {
    const environment = { PI_PROXY_AUTH_HEADER: "  ", PI_PROXY_API_KEY: "" };

    assert.equal(readProxyCredential(environment), null);
  });
});

describe("asking whether this pi session has the credential", () => {
  it("says yes for either variable", () => {
    assert.equal(hasProxyCredential({ PI_PROXY_AUTH_HEADER: "Bearer token" }), true);
    assert.equal(hasProxyCredential({ PI_PROXY_API_KEY: "key" }), true);
  });

  it("says no when there is nothing to read", () => {
    assert.equal(hasProxyCredential({ PATH: "/usr/bin" }), false);
  });
});

describe("insisting on the credential", () => {
  it("hands back the header when it is there", () => {
    assert.equal(requireProxyCredential({ PI_PROXY_API_KEY: "key" }), "Bearer key");
  });

  it("names both variables and how to get them when there is no credential", () => {
    assert.throws(() => requireProxyCredential({ PATH: "/usr/bin" }), (cause: unknown) => {
      assert.ok(cause instanceof MissingProxyCredentialError);
      assert.match(cause.message, /PI_PROXY_AUTH_HEADER/);
      assert.match(cause.message, /PI_PROXY_API_KEY/);
      assert.match(cause.message, /devx pi/);
      return true;
    });
  });
});
