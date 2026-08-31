import type { HttpTransport, RawHttpResponse } from "./http-transport.ts";
import type { AllowedRequestTarget, RequestTargetGuard } from "./request-target-guard.ts";
import { BlockedRequestError } from "./request-target-guard.ts";

export const DEFAULT_MAXIMUM_RESPONSE_BYTES = 2_000_000;
export const DEFAULT_MAXIMUM_REDIRECTS = 5;
export const DEFAULT_REQUEST_TIMEOUT_MILLISECONDS = 10_000;
export const DEFAULT_TOTAL_TIMEOUT_MILLISECONDS = 30_000;
export const DEFAULT_USER_AGENT = "pi-teach-reference-reader";

/**
 * Media types a lesson reference can be made of. Anything else — an image, an
 * archive, a binary download — is refused with its type named, rather than stored
 * as unreadable bytes.
 */
export const READABLE_MEDIA_TYPES = [
  "text/plain",
  "text/html",
  "text/markdown",
  "text/x-markdown",
  "text/xml",
  "text/csv",
  "application/json",
  "application/xml",
  "application/xhtml+xml",
] as const;

export interface SafeHttpClientOptions {
  readonly maximumRedirects?: number;
  readonly maximumResponseBytes?: number;
  readonly requestTimeoutMilliseconds?: number;
  readonly totalTimeoutMilliseconds?: number;
  readonly userAgent?: string;
  readonly now?: () => number;
}

export interface FetchedDocument {
  readonly finalUrl: string;
  readonly mediaType: string;
  readonly text: string;
  readonly byteLength: number;
}

export class HttpStatusError extends Error {
  readonly statusCode: number;
  readonly requestedUrl: string;

  constructor(statusCode: number, requestedUrl: string) {
    super(`${requestedUrl} answered with status ${statusCode}.`);
    this.name = "HttpStatusError";
    this.statusCode = statusCode;
    this.requestedUrl = requestedUrl;
  }
}

export class UnreadableMediaTypeError extends Error {
  readonly mediaType: string;

  constructor(mediaType: string, requestedUrl: string) {
    super(`${requestedUrl} is ${mediaType}, which a lesson cannot read as text.`);
    this.name = "UnreadableMediaTypeError";
    this.mediaType = mediaType;
  }
}

export class TooManyRedirectsError extends Error {
  constructor(maximumRedirects: number) {
    super(`The address redirected more than ${maximumRedirects} times.`);
    this.name = "TooManyRedirectsError";
  }
}

export class TotalTimeExceededError extends Error {
  constructor(totalTimeoutMilliseconds: number) {
    super(`Copying took longer than ${totalTimeoutMilliseconds} milliseconds.`);
    this.name = "TotalTimeExceededError";
  }
}

const REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308] as const;

/**
 * Fetches a public document and refuses everything that would let a link reach
 * something it should not.
 *
 * The rules are all in one place on purpose. A redirect is checked exactly like a
 * first address, because a redirect is an address someone else chose: `checkedFetch`
 * loops instead of recursing so there is one code path and one place the redirect
 * count is enforced.
 */
export class SafeHttpClient {
  private readonly requestTargetGuard: RequestTargetGuard;
  private readonly httpTransport: HttpTransport;
  private readonly maximumRedirects: number;
  private readonly maximumResponseBytes: number;
  private readonly requestTimeoutMilliseconds: number;
  private readonly totalTimeoutMilliseconds: number;
  private readonly userAgent: string;
  private readonly now: () => number;

  constructor(
    requestTargetGuard: RequestTargetGuard,
    httpTransport: HttpTransport,
    options: SafeHttpClientOptions = {},
  ) {
    this.requestTargetGuard = requestTargetGuard;
    this.httpTransport = httpTransport;
    this.maximumRedirects = options.maximumRedirects ?? DEFAULT_MAXIMUM_REDIRECTS;
    this.maximumResponseBytes = options.maximumResponseBytes ?? DEFAULT_MAXIMUM_RESPONSE_BYTES;
    this.requestTimeoutMilliseconds =
      options.requestTimeoutMilliseconds ?? DEFAULT_REQUEST_TIMEOUT_MILLISECONDS;
    this.totalTimeoutMilliseconds =
      options.totalTimeoutMilliseconds ?? DEFAULT_TOTAL_TIMEOUT_MILLISECONDS;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.now = options.now ?? Date.now;
  }

  /** Gets a readable document. Refuses anything that is not text a lesson can use. */
  async fetchDocument(
    candidateUrl: string,
    acceptHeader = "text/html,text/plain;q=0.9,*/*;q=0.1",
  ): Promise<FetchedDocument> {
    const { response, finalUrl } = await this.followToFinalResponse(candidateUrl, acceptHeader);
    const mediaType = mediaTypeOf(response, "text/plain");

    if (!isReadableMediaType(mediaType)) {
      throw new UnreadableMediaTypeError(mediaType, finalUrl);
    }

    return {
      finalUrl,
      mediaType,
      text: decodeBody(response),
      byteLength: response.body.byteLength,
    };
  }

  /** Gets one JSON document. Used for public API reads such as the GitHub API. */
  async fetchJson(candidateUrl: string, acceptHeader = "application/json"): Promise<unknown> {
    const { response, finalUrl } = await this.followToFinalResponse(candidateUrl, acceptHeader);
    const mediaType = mediaTypeOf(response, "application/json");

    if (!isJsonMediaType(mediaType)) {
      throw new UnreadableMediaTypeError(mediaType, finalUrl);
    }
    try {
      return JSON.parse(decodeBody(response)) as unknown;
    } catch {
      throw new UnreadableMediaTypeError(`${mediaType} (not valid JSON)`, finalUrl);
    }
  }

  private async followToFinalResponse(
    candidateUrl: string,
    acceptHeader: string,
  ): Promise<{ readonly response: RawHttpResponse; readonly finalUrl: string }> {
    const startedAt = this.now();
    let nextUrl = candidateUrl;

    for (let redirectCount = 0; redirectCount <= this.maximumRedirects; redirectCount += 1) {
      const target = await this.checkTarget(nextUrl);
      const response = await this.sendRequest(target, acceptHeader, startedAt);

      const redirectUrl = this.redirectUrlOf(response, target);
      if (redirectUrl === null) {
        if (response.statusCode < 200 || response.statusCode > 299) {
          throw new HttpStatusError(response.statusCode, target.url.href);
        }
        return { response, finalUrl: target.url.href };
      }
      nextUrl = redirectUrl;
    }

    throw new TooManyRedirectsError(this.maximumRedirects);
  }

  private async checkTarget(candidateUrl: string): Promise<AllowedRequestTarget> {
    return this.requestTargetGuard.check(candidateUrl);
  }

  private async sendRequest(
    target: AllowedRequestTarget,
    acceptHeader: string,
    startedAt: number,
  ): Promise<RawHttpResponse> {
    const timeoutMilliseconds = this.remainingMilliseconds(startedAt);
    return this.httpTransport.send({
      url: target.url,
      addresses: target.addresses,
      headers: {
        accept: acceptHeader,
        "accept-encoding": "identity",
        "user-agent": this.userAgent,
      },
      timeoutMilliseconds,
      maximumBodyBytes: this.maximumResponseBytes,
    });
  }

  private remainingMilliseconds(startedAt: number): number {
    const remaining = this.totalTimeoutMilliseconds - (this.now() - startedAt);
    if (remaining <= 0) {
      throw new TotalTimeExceededError(this.totalTimeoutMilliseconds);
    }
    return Math.min(remaining, this.requestTimeoutMilliseconds);
  }

  /**
   * Returns the address a redirect points at, resolved against the address that
   * answered. Returns null when the answer was not a redirect.
   */
  private redirectUrlOf(response: RawHttpResponse, target: AllowedRequestTarget): string | null {
    if (!(REDIRECT_STATUS_CODES as readonly number[]).includes(response.statusCode)) {
      return null;
    }
    const location = response.headers["location"];
    if (location === undefined || location.trim().length === 0) {
      throw new HttpStatusError(response.statusCode, target.url.href);
    }
    try {
      return new URL(location, target.url).href;
    } catch {
      throw new BlockedRequestError(
        "unparsable_url",
        location,
        `${target.url.href} redirected to ${location}, which is not a web address.`,
      );
    }
  }
}

export function isReadableMediaType(mediaType: string): boolean {
  if ((READABLE_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    return true;
  }
  return mediaType.endsWith("+json") || mediaType.endsWith("+xml");
}

function isJsonMediaType(mediaType: string): boolean {
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

function mediaTypeOf(response: RawHttpResponse, fallback: string): string {
  const header = response.headers["content-type"];
  if (header === undefined) {
    return fallback;
  }
  const mediaType = (header.split(";")[0] ?? "").trim().toLowerCase();
  return mediaType.length === 0 ? fallback : mediaType;
}

function charsetOf(response: RawHttpResponse): string {
  const header = response.headers["content-type"] ?? "";
  const match = /charset=([^;]+)/i.exec(header);
  const charset = match?.[1]?.trim().replace(/^"|"$/g, "");
  return charset === undefined || charset.length === 0 ? "utf-8" : charset;
}

function decodeBody(response: RawHttpResponse): string {
  const charset = charsetOf(response);
  try {
    return new TextDecoder(charset, { fatal: false }).decode(response.body);
  } catch {
    // An unknown charset name is not worth failing the whole copy over; the bytes
    // are almost always utf-8 in practice.
    return new TextDecoder("utf-8", { fatal: false }).decode(response.body);
  }
}
