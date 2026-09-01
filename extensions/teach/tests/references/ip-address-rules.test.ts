import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkAddress } from "../../src/references/ip-address-rules.ts";

describe("checkAddress", () => {
  it("allows an ordinary public address", () => {
    assert.equal(checkAddress("93.184.216.34").allowed, true);
  });

  it("allows an ordinary public IPv6 address", () => {
    assert.equal(checkAddress("2606:2800:220:1:248:1893:25c8:1946").allowed, true);
  });

  it("blocks loopback", () => {
    assert.deepEqual(checkAddress("127.0.0.1"), { allowed: false, reason: "loopback" });
  });

  it("blocks IPv6 loopback", () => {
    assert.deepEqual(checkAddress("::1"), { allowed: false, reason: "loopback" });
  });

  it("blocks the cloud metadata address", () => {
    assert.deepEqual(checkAddress("169.254.169.254"), {
      allowed: false,
      reason: "cloud_metadata",
    });
  });

  it("blocks other link-local addresses", () => {
    assert.deepEqual(checkAddress("169.254.10.1"), { allowed: false, reason: "link_local" });
  });

  it("blocks IPv6 link-local addresses", () => {
    assert.deepEqual(checkAddress("fe80::1"), { allowed: false, reason: "link_local" });
  });

  it("blocks private networks", () => {
    for (const privateAddress of ["10.0.0.5", "172.16.4.4", "192.168.1.10", "100.64.0.1"]) {
      assert.deepEqual(
        checkAddress(privateAddress),
        { allowed: false, reason: "private" },
        privateAddress,
      );
    }
  });

  it("blocks IPv6 unique local addresses", () => {
    assert.deepEqual(checkAddress("fd12:3456::1"), { allowed: false, reason: "private" });
  });

  it("blocks multicast", () => {
    assert.deepEqual(checkAddress("224.0.0.1"), { allowed: false, reason: "multicast" });
  });

  it("blocks IPv6 multicast", () => {
    assert.deepEqual(checkAddress("ff02::1"), { allowed: false, reason: "multicast" });
  });

  it("blocks the unspecified address", () => {
    assert.deepEqual(checkAddress("0.0.0.0"), { allowed: false, reason: "unspecified" });
  });

  it("blocks an IPv4 loopback hidden inside an IPv6-mapped address", () => {
    assert.deepEqual(checkAddress("::ffff:127.0.0.1"), { allowed: false, reason: "loopback" });
  });

  it("blocks the metadata address hidden inside a NAT64 address", () => {
    assert.deepEqual(checkAddress("64:ff9b::169.254.169.254"), {
      allowed: false,
      reason: "cloud_metadata",
    });
  });

  it("blocks anything that is not an address at all", () => {
    assert.deepEqual(checkAddress("not-an-address"), { allowed: false, reason: "unparsable" });
  });
});
