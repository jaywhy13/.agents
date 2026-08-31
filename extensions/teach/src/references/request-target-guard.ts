import type { HostAddressResolver, ResolvedAddress } from "./host-address-resolver.ts";
import type { BlockedAddressReason } from "./ip-address-rules.ts";
import { checkAddress } from "./ip-address-rules.ts";

export type BlockedRequestReason =
  | "unparsable_url"
  | "unsupported_scheme"
  | "credentials_in_url"
  | "blocked_hostname"
  | "unresolvable_hostname"
  | BlockedAddressReason;

export class BlockedRequestError extends Error {
  readonly reason: BlockedRequestReason;
  readonly attemptedUrl: string;

  constructor(reason: BlockedRequestReason, attemptedUrl: string, message: string) {
    super(message);
    this.name = "BlockedRequestError";
    this.reason = reason;
    this.attemptedUrl = attemptedUrl;
  }
}

/**
 * One address the request is actually allowed to open a socket to, together with
 * the name that was checked. The client connects to `addresses` and never asks the
 * resolver a second time, so the name cannot change into a private address between
 * the check and the connection.
 */
export interface AllowedRequestTarget {
  readonly url: URL;
  readonly addresses: readonly ResolvedAddress[];
}

const ALLOWED_SCHEMES = ["http:", "https:"] as const;

/**
 * Hostnames that must never be looked up, whatever the resolver would say. A
 * resolver can be told to answer anything, and some of these names are handled
 * inside the operating system rather than by the resolver at all.
 */
const BLOCKED_HOSTNAME_SUFFIXES = [
  "localhost",
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
] as const;

/**
 * Everything that has to be true before a request may leave this machine. It runs
 * for the first address and again for every redirect, because a redirect is just
 * another address someone else chose.
 */
export class RequestTargetGuard {
  private readonly hostAddressResolver: HostAddressResolver;

  constructor(hostAddressResolver: HostAddressResolver) {
    this.hostAddressResolver = hostAddressResolver;
  }

  async check(candidateUrl: string): Promise<AllowedRequestTarget> {
    const url = this.parseUrl(candidateUrl);
    this.checkScheme(url);
    this.checkNoCredentials(url);
    this.checkHostname(url);
    const addresses = await this.resolveAddresses(url);
    this.checkEveryAddress(url, addresses);
    return { url, addresses };
  }

  private parseUrl(candidateUrl: string): URL {
    try {
      return new URL(candidateUrl);
    } catch {
      throw new BlockedRequestError(
        "unparsable_url",
        candidateUrl,
        `${candidateUrl} is not a web address.`,
      );
    }
  }

  private checkScheme(url: URL): void {
    if (!(ALLOWED_SCHEMES as readonly string[]).includes(url.protocol)) {
      throw new BlockedRequestError(
        "unsupported_scheme",
        url.href,
        `Only http and https can be fetched. ${url.protocol} cannot.`,
      );
    }
  }

  private checkNoCredentials(url: URL): void {
    if (url.username.length > 0 || url.password.length > 0) {
      throw new BlockedRequestError(
        "credentials_in_url",
        url.href,
        "A reference address may not carry a username or a password.",
      );
    }
  }

  private checkHostname(url: URL): void {
    const hostname = normalizeHostname(url.hostname);
    if (hostname.length === 0) {
      throw new BlockedRequestError("blocked_hostname", url.href, "The address has no host name.");
    }
    for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
      const isBlocked = suffix.startsWith(".") ? hostname.endsWith(suffix) : hostname === suffix;
      if (isBlocked) {
        throw new BlockedRequestError(
          "blocked_hostname",
          url.href,
          `${hostname} is a name on this machine or this network, so it cannot be a reference.`,
        );
      }
    }
  }

  private async resolveAddresses(url: URL): Promise<readonly ResolvedAddress[]> {
    const hostname = normalizeHostname(url.hostname);
    const literalAddress = literalAddressOf(hostname);
    if (literalAddress !== null) {
      return [literalAddress];
    }

    let addresses: readonly ResolvedAddress[];
    try {
      addresses = await this.hostAddressResolver.resolve(hostname);
    } catch (cause) {
      throw new BlockedRequestError(
        "unresolvable_hostname",
        url.href,
        `${hostname} could not be looked up: ${describeCause(cause)}`,
      );
    }
    if (addresses.length === 0) {
      throw new BlockedRequestError(
        "unresolvable_hostname",
        url.href,
        `${hostname} has no addresses.`,
      );
    }
    return addresses;
  }

  /**
   * Every answer has to pass, not just the first one. A name that answers with one
   * public address and one loopback address is refused outright, because which one
   * a connection would pick is not ours to decide.
   */
  private checkEveryAddress(url: URL, addresses: readonly ResolvedAddress[]): void {
    for (const resolved of addresses) {
      const decision = checkAddress(resolved.address);
      if (!decision.allowed) {
        throw new BlockedRequestError(
          decision.reason ?? "unparsable",
          url.href,
          `${url.hostname} resolves to ${resolved.address}, which is a ${describeReason(decision.reason)} address.`,
        );
      }
    }
  }
}

function normalizeHostname(hostname: string): string {
  const withoutBrackets = hostname.replace(/^\[/, "").replace(/\]$/, "");
  return withoutBrackets.replace(/\.$/, "").toLowerCase();
}

/** An address written straight into the link never goes to the resolver. */
function literalAddressOf(hostname: string): ResolvedAddress | null {
  const decision = checkAddress(hostname);
  if (decision.reason === "unparsable") {
    return null;
  }
  return { address: hostname, family: hostname.includes(":") ? 6 : 4 };
}

function describeReason(reason: BlockedAddressReason | null): string {
  if (reason === null) {
    return "blocked";
  }
  return reason.replace(/_/g, " ");
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
