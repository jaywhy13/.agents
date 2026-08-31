import { lookup } from "node:dns/promises";

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

/**
 * Turns a hostname into every address it currently answers with. The safe HTTP
 * client owns this interface so a test can answer with whatever addresses the test
 * is about, with no network anywhere near it.
 */
export interface HostAddressResolver {
  resolve(hostname: string): Promise<readonly ResolvedAddress[]>;
}

/** Uses the operating system resolver, the same one an ordinary request would use. */
export class SystemHostAddressResolver implements HostAddressResolver {
  async resolve(hostname: string): Promise<readonly ResolvedAddress[]> {
    const entries = await lookup(hostname, { all: true, verbatim: true });
    return entries.map((entry) => ({
      address: entry.address,
      family: entry.family === 6 ? 6 : 4,
    }));
  }
}
