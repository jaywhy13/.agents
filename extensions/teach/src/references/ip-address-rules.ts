import { isIP } from "node:net";

/**
 * Why one address may not be contacted. The reason travels with the refusal so a
 * message to the learner can say what happened without guessing.
 */
export type BlockedAddressReason =
  | "unparsable"
  | "loopback"
  | "private"
  | "link_local"
  | "cloud_metadata"
  | "multicast"
  | "unspecified"
  | "reserved";

export interface AddressDecision {
  readonly allowed: boolean;
  readonly reason: BlockedAddressReason | null;
}

const ALLOWED: AddressDecision = { allowed: true, reason: null };

/** The address every major cloud serves instance credentials from. */
export const CLOUD_METADATA_ADDRESSES = ["169.254.169.254", "fd00:ec2::254"] as const;

interface Ipv4Rule {
  readonly prefixLength: number;
  readonly networkOctets: readonly [number, number, number, number];
  readonly reason: BlockedAddressReason;
}

/**
 * Blocked IPv4 networks, written out one per line rather than folded into a clever
 * test, so adding a network later is one more line and never a rewrite.
 */
const BLOCKED_IPV4_NETWORKS: readonly Ipv4Rule[] = [
  ipv4Rule("0.0.0.0", 8, "unspecified"),
  ipv4Rule("10.0.0.0", 8, "private"),
  ipv4Rule("100.64.0.0", 10, "private"),
  ipv4Rule("127.0.0.0", 8, "loopback"),
  ipv4Rule("169.254.169.254", 32, "cloud_metadata"),
  ipv4Rule("169.254.0.0", 16, "link_local"),
  ipv4Rule("172.16.0.0", 12, "private"),
  ipv4Rule("192.0.0.0", 24, "reserved"),
  ipv4Rule("192.0.2.0", 24, "reserved"),
  ipv4Rule("192.88.99.0", 24, "reserved"),
  ipv4Rule("192.168.0.0", 16, "private"),
  ipv4Rule("198.18.0.0", 15, "reserved"),
  ipv4Rule("198.51.100.0", 24, "reserved"),
  ipv4Rule("203.0.113.0", 24, "reserved"),
  ipv4Rule("224.0.0.0", 4, "multicast"),
  ipv4Rule("240.0.0.0", 4, "reserved"),
];

/**
 * Decides whether one resolved address may be contacted. Everything that is not a
 * public, routable address is refused, because a lesson reference is always a
 * public document and never something on the learner's own network.
 */
export function checkAddress(address: string): AddressDecision {
  const family = isIP(address);
  if (family === 4) {
    return checkIpv4(address);
  }
  if (family === 6) {
    return checkIpv6(address);
  }
  return { allowed: false, reason: "unparsable" };
}

export function isBlockedAddress(address: string): boolean {
  return !checkAddress(address).allowed;
}

function checkIpv4(address: string): AddressDecision {
  const octets = parseIpv4Octets(address);
  if (octets === null) {
    return { allowed: false, reason: "unparsable" };
  }
  if (octets.every((octet) => octet === 255)) {
    return { allowed: false, reason: "reserved" };
  }

  for (const rule of BLOCKED_IPV4_NETWORKS) {
    if (matchesIpv4Network(octets, rule)) {
      return { allowed: false, reason: rule.reason };
    }
  }
  return ALLOWED;
}

function checkIpv6(address: string): AddressDecision {
  const groups = parseIpv6Groups(address);
  if (groups === null) {
    return { allowed: false, reason: "unparsable" };
  }

  const embeddedIpv4 = embeddedIpv4Address(groups);
  if (embeddedIpv4 !== null) {
    // An IPv4-mapped or NAT64 address reaches the IPv4 host inside it, so it must
    // pass the IPv4 rules and not a separate, weaker set of IPv6 rules.
    return checkIpv4(embeddedIpv4);
  }

  if (groups.every((group) => group === 0)) {
    return { allowed: false, reason: "unspecified" };
  }
  if (isLoopbackIpv6(groups)) {
    return { allowed: false, reason: "loopback" };
  }

  const firstGroup = groups[0] ?? 0;
  if ((firstGroup & 0xff00) === 0xff00) {
    return { allowed: false, reason: "multicast" };
  }
  if ((firstGroup & 0xffc0) === 0xfe80) {
    return { allowed: false, reason: "link_local" };
  }
  if ((firstGroup & 0xfe00) === 0xfc00) {
    return isCloudMetadataIpv6(groups)
      ? { allowed: false, reason: "cloud_metadata" }
      : { allowed: false, reason: "private" };
  }
  if (firstGroup === 0x2001 && groups[1] === 0x0db8) {
    return { allowed: false, reason: "reserved" };
  }
  if (firstGroup === 0x0100 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0) {
    return { allowed: false, reason: "reserved" };
  }
  return ALLOWED;
}

function isLoopbackIpv6(groups: readonly number[]): boolean {
  return groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
}

function isCloudMetadataIpv6(groups: readonly number[]): boolean {
  return groups[0] === 0xfd00 && groups[1] === 0x0ec2 && groups[7] === 0x0254;
}

/**
 * `::ffff:a.b.c.d` (IPv4-mapped) and `64:ff9b::a.b.c.d` (NAT64) both carry a real
 * IPv4 destination in the last two groups.
 */
function embeddedIpv4Address(groups: readonly number[]): string | null {
  const isIpv4Mapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const isNat64 =
    groups[0] === 0x0064 &&
    groups[1] === 0xff9b &&
    groups.slice(2, 6).every((group) => group === 0);

  if (!isIpv4Mapped && !isNat64) {
    return null;
  }

  const high = groups[6] ?? 0;
  const low = groups[7] ?? 0;
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

function parseIpv4Octets(address: string): readonly number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^[0-9]{1,3}$/.test(part)) {
      return null;
    }
    const octet = Number.parseInt(part, 10);
    if (octet > 255) {
      return null;
    }
    octets.push(octet);
  }
  return octets;
}

/** Returns the eight 16-bit groups of an IPv6 address, expanding any `::`. */
function parseIpv6Groups(address: string): readonly number[] | null {
  const withoutZone = address.split("%")[0] ?? address;
  const [head, tail, ...extra] = withoutZone.split("::");
  if (extra.length > 0 || head === undefined) {
    return null;
  }

  const headGroups = expandGroups(head);
  const tailGroups = tail === undefined ? [] : expandGroups(tail);
  if (headGroups === null || tailGroups === null) {
    return null;
  }

  if (tail === undefined) {
    return headGroups.length === 8 ? headGroups : null;
  }

  const missing = 8 - headGroups.length - tailGroups.length;
  if (missing < 0) {
    return null;
  }
  return [...headGroups, ...new Array<number>(missing).fill(0), ...tailGroups];
}

function expandGroups(part: string): number[] | null {
  if (part.length === 0) {
    return [];
  }

  const groups: number[] = [];
  const pieces = part.split(":");
  for (const [index, piece] of pieces.entries()) {
    const isLastPiece = index === pieces.length - 1;
    if (isLastPiece && piece.includes(".")) {
      const octets = parseIpv4Octets(piece);
      if (octets === null) {
        return null;
      }
      groups.push(((octets[0] ?? 0) << 8) | (octets[1] ?? 0));
      groups.push(((octets[2] ?? 0) << 8) | (octets[3] ?? 0));
      continue;
    }
    if (!/^[0-9A-Fa-f]{1,4}$/.test(piece)) {
      return null;
    }
    groups.push(Number.parseInt(piece, 16));
  }
  return groups;
}

function matchesIpv4Network(octets: readonly number[], rule: Ipv4Rule): boolean {
  const addressValue = ipv4Value(octets);
  const networkValue = ipv4Value(rule.networkOctets);
  const mask = rule.prefixLength === 0 ? 0 : (0xffffffff << (32 - rule.prefixLength)) >>> 0;
  return ((addressValue & mask) >>> 0) === ((networkValue & mask) >>> 0);
}

function ipv4Value(octets: readonly number[]): number {
  return (
    (((octets[0] ?? 0) << 24) |
      ((octets[1] ?? 0) << 16) |
      ((octets[2] ?? 0) << 8) |
      (octets[3] ?? 0)) >>>
    0
  );
}

function ipv4Rule(network: string, prefixLength: number, reason: BlockedAddressReason): Ipv4Rule {
  const octets = parseIpv4Octets(network);
  if (octets === null || octets.length !== 4) {
    throw new Error(`Blocked network ${network} is not an IPv4 address.`);
  }
  return {
    prefixLength,
    networkOctets: [octets[0] ?? 0, octets[1] ?? 0, octets[2] ?? 0, octets[3] ?? 0],
    reason,
  };
}
