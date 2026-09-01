import { splitTokenRoute } from "../../shared/lesson-route.ts";
import { matchesAccessToken } from "./access-token.ts";

export const LOOPBACK_ADDRESS = "127.0.0.1";
export const ACCESS_TOKEN_HEADER = "x-teach-token";

export interface RequestGuardOptions {
  readonly accessToken: string;
  readonly port: number;
}

export interface InboundRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly requestUrl: string;
}

export type GuardDecision =
  | {
      readonly allowed: true;
      /** The path with the token route removed, which is what the server routes on. */
      readonly lessonPath: string;
      /** True when the caller must be sent to the same address with a trailing slash. */
      readonly needsTrailingSlash: boolean;
    }
  | { readonly allowed: false; readonly statusCode: 401 | 403; readonly reason: string };

type OriginDecision = { readonly allowed: true } | Extract<GuardDecision, { allowed: false }>;

const ORIGIN_ALLOWED = { allowed: true } as const;

/**
 * Protocol-level admission control for the lesson server. Two independent checks:
 * the request must look like it came from the lesson page on this machine, and it
 * must carry the session token.
 *
 * The token is read from the lesson route (`/t/<token>/...`) or from an explicit
 * request header. It is never read from a cookie: a cookie set on `127.0.0.1`
 * reaches every other local program, whatever port it listens on.
 */
export class RequestGuard {
  private readonly accessToken: string;
  private readonly port: number;

  constructor(options: RequestGuardOptions) {
    this.accessToken = options.accessToken;
    this.port = options.port;
  }

  check(request: InboundRequest): GuardDecision {
    const originDecision = this.checkOrigin(request);
    if (!originDecision.allowed) {
      return originDecision;
    }

    const route = splitTokenRoute(request.requestUrl);
    const headerToken = singleHeader(request.headers[ACCESS_TOKEN_HEADER]);
    const tokenMatches =
      matchesAccessToken(this.accessToken, route?.token) ||
      matchesAccessToken(this.accessToken, headerToken);

    if (!tokenMatches) {
      return { allowed: false, statusCode: 401, reason: "Missing or incorrect lesson token." };
    }

    return {
      allowed: true,
      lessonPath: route?.lessonPath ?? pathOf(request.requestUrl),
      needsTrailingSlash: route?.needsTrailingSlash ?? false,
    };
  }

  checkOrigin(request: InboundRequest): OriginDecision {
    const host = singleHeader(request.headers["host"]);
    if (host === undefined || !this.allowedHosts().includes(host)) {
      return {
        allowed: false,
        statusCode: 403,
        reason: "Host header is not the loopback lesson server.",
      };
    }

    const origin = singleHeader(request.headers["origin"]);
    // A missing Origin header means the caller is not a browser page. The token
    // check still applies, so there is nothing extra to enforce here.
    if (origin === undefined || origin === "null") {
      return ORIGIN_ALLOWED;
    }

    if (!this.allowedOrigins().includes(origin)) {
      return { allowed: false, statusCode: 403, reason: "Origin is not the lesson page." };
    }

    return ORIGIN_ALLOWED;
  }

  allowedOrigins(): readonly string[] {
    return [`http://${LOOPBACK_ADDRESS}:${this.port}`];
  }

  allowedHosts(): readonly string[] {
    return [`${LOOPBACK_ADDRESS}:${this.port}`];
  }
}

export function securityResponseHeaders(port: number): Readonly<Record<string, string>> {
  return {
    "Content-Security-Policy": contentSecurityPolicy(port),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "no-store",
  };
}

/**
 * `default-src 'none'` and then only what the lesson page actually does.
 *
 * Two allowances are wider than the rest, and both are as narrow as the thing they
 * are for allows:
 *
 * - `img-src` and `media-src` allow `blob:`. The diagram editor draws into a canvas
 *   and exports it as a blob, and the narration audio is played from a blob made
 *   from bytes this server sent. Neither is a network address: a `blob:` URL can
 *   only be made by this page, from bytes the page already has.
 * - `worker-src 'self' blob:`. The diagram editor starts its own worker from a blob
 *   it built, which is how bundled editors ship a worker without a second file.
 *
 * Nothing here allows another origin, an inline script, or `eval`.
 */
export function contentSecurityPolicy(port: number): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "media-src blob:",
    "font-src 'self'",
    "worker-src 'self' blob:",
    `connect-src 'self' ws://${LOOPBACK_ADDRESS}:${port}`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value.length === 1 ? value[0] : undefined;
  }
  return value;
}

function pathOf(requestUrl: string): string {
  return requestUrl.split("?")[0] ?? "/";
}
