import { isIP } from "node:net";

import type {
  HostAddressResolver,
  ResolvedAddress,
} from "../../../src/references/host-address-resolver.ts";

/**
 * Answers name lookups with whatever the test is about. No test in this module
 * ever touches the real resolver, so nothing here depends on the network.
 */
export class FakeHostAddressResolver implements HostAddressResolver {
  readonly lookedUpHostnames: string[] = [];
  private readonly addressesByHostname = new Map<string, readonly ResolvedAddress[]>();
  private readonly failingHostnames = new Set<string>();

  answerWith(hostname: string, ...addresses: readonly string[]): this {
    this.addressesByHostname.set(
      hostname.toLowerCase(),
      addresses.map((address) => ({ address, family: isIP(address) === 6 ? 6 : 4 })),
    );
    return this;
  }

  failFor(hostname: string): this {
    this.failingHostnames.add(hostname.toLowerCase());
    return this;
  }

  async resolve(hostname: string): Promise<readonly ResolvedAddress[]> {
    const lowercaseHostname = hostname.toLowerCase();
    this.lookedUpHostnames.push(lowercaseHostname);

    if (this.failingHostnames.has(lowercaseHostname)) {
      throw new Error(`getaddrinfo ENOTFOUND ${hostname}`);
    }
    return this.addressesByHostname.get(lowercaseHostname) ?? [];
  }
}
