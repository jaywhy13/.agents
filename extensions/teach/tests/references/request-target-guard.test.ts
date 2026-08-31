import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BlockedRequestError,
  RequestTargetGuard,
} from "../../src/references/request-target-guard.ts";
import { FakeHostAddressResolver } from "./support/fake-host-address-resolver.ts";

async function blockedReasonFor(guard: RequestTargetGuard, url: string): Promise<string> {
  try {
    await guard.check(url);
  } catch (cause) {
    assert.ok(cause instanceof BlockedRequestError, `expected a blocked request for ${url}`);
    return cause.reason;
  }
  assert.fail(`${url} was allowed but should have been blocked`);
}

describe("RequestTargetGuard", () => {
  it("allows a public address and reports what it resolved to", async () => {
    const hostAddressResolver = new FakeHostAddressResolver().answerWith(
      "example.com",
      "93.184.216.34",
    );
    const guard = new RequestTargetGuard(hostAddressResolver);

    const target = await guard.check("https://example.com/queues");

    assert.deepEqual(target.addresses, [{ address: "93.184.216.34", family: 4 }]);
  });

  it("blocks a scheme that is not http or https", async () => {
    const guard = new RequestTargetGuard(new FakeHostAddressResolver());

    assert.equal(await blockedReasonFor(guard, "file:///etc/passwd"), "unsupported_scheme");
  });

  it("blocks a link that carries credentials", async () => {
    const guard = new RequestTargetGuard(
      new FakeHostAddressResolver().answerWith("example.com", "93.184.216.34"),
    );

    assert.equal(
      await blockedReasonFor(guard, "https://user:secret@example.com/page"),
      "credentials_in_url",
    );
  });

  it("blocks localhost without looking it up", async () => {
    const hostAddressResolver = new FakeHostAddressResolver();
    const guard = new RequestTargetGuard(hostAddressResolver);

    assert.equal(await blockedReasonFor(guard, "http://localhost:8080/"), "blocked_hostname");
    assert.deepEqual(hostAddressResolver.lookedUpHostnames, []);
  });

  it("blocks the cloud metadata name without looking it up", async () => {
    const guard = new RequestTargetGuard(new FakeHostAddressResolver());

    assert.equal(
      await blockedReasonFor(guard, "http://metadata.google.internal/computeMetadata/v1/"),
      "blocked_hostname",
    );
  });

  it("blocks a public name that resolves to a loopback address", async () => {
    const guard = new RequestTargetGuard(
      new FakeHostAddressResolver().answerWith("sneaky.example.com", "127.0.0.1"),
    );

    assert.equal(await blockedReasonFor(guard, "https://sneaky.example.com/"), "loopback");
  });

  it("blocks a name that resolves to the cloud metadata address", async () => {
    const guard = new RequestTargetGuard(
      new FakeHostAddressResolver().answerWith("sneaky.example.com", "169.254.169.254"),
    );

    assert.equal(await blockedReasonFor(guard, "https://sneaky.example.com/"), "cloud_metadata");
  });

  it("blocks a name whose second address is private, not only the first", async () => {
    const guard = new RequestTargetGuard(
      new FakeHostAddressResolver().answerWith("mixed.example.com", "93.184.216.34", "10.0.0.5"),
    );

    assert.equal(await blockedReasonFor(guard, "https://mixed.example.com/"), "private");
  });

  it("blocks a private address written straight into the link", async () => {
    const hostAddressResolver = new FakeHostAddressResolver();
    const guard = new RequestTargetGuard(hostAddressResolver);

    assert.equal(await blockedReasonFor(guard, "http://192.168.1.10/admin"), "private");
    assert.deepEqual(hostAddressResolver.lookedUpHostnames, []);
  });

  it("blocks an IPv6 loopback written straight into the link", async () => {
    const guard = new RequestTargetGuard(new FakeHostAddressResolver());

    assert.equal(await blockedReasonFor(guard, "http://[::1]:9000/"), "loopback");
  });

  it("blocks a name that cannot be looked up", async () => {
    const guard = new RequestTargetGuard(new FakeHostAddressResolver().failFor("missing.example"));

    assert.equal(
      await blockedReasonFor(guard, "https://missing.example/"),
      "unresolvable_hostname",
    );
  });

  it("blocks a name with no addresses", async () => {
    const guard = new RequestTargetGuard(new FakeHostAddressResolver());

    assert.equal(await blockedReasonFor(guard, "https://empty.example/"), "unresolvable_hostname");
  });
});
