import http from "node:http";
import https from "node:https";

import type { ResolvedAddress } from "./host-address-resolver.ts";

export interface HttpRequestSpecification {
  readonly url: URL;
  /** The only addresses a socket may be opened to. Already checked by the guard. */
  readonly addresses: readonly ResolvedAddress[];
  readonly headers: Readonly<Record<string, string>>;
  readonly timeoutMilliseconds: number;
  readonly maximumBodyBytes: number;
}

export interface RawHttpResponse {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
}

/**
 * One request, one response, no redirect following and no retry. Redirects are
 * deliberately left to the caller: each one has to be checked again before it may
 * be followed, and a transport is the wrong place for that decision.
 */
export interface HttpTransport {
  send(specification: HttpRequestSpecification): Promise<RawHttpResponse>;
}

export class ResponseTooLargeError extends Error {
  readonly maximumBodyBytes: number;

  constructor(maximumBodyBytes: number) {
    super(`The response is larger than the ${maximumBodyBytes} byte limit.`);
    this.name = "ResponseTooLargeError";
    this.maximumBodyBytes = maximumBodyBytes;
  }
}

export class RequestTimeoutError extends Error {
  readonly timeoutMilliseconds: number;

  constructor(timeoutMilliseconds: number) {
    super(`The server did not answer within ${timeoutMilliseconds} milliseconds.`);
    this.name = "RequestTimeoutError";
    this.timeoutMilliseconds = timeoutMilliseconds;
  }
}

export class TransportError extends Error {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "TransportError";
  }
}

/**
 * Sends the request with Node's own http and https modules, and pins the socket to
 * the addresses the guard already approved.
 *
 * Pinning is the point of this class. Looking a name up, approving the answer and
 * then handing the name back to the network stack leaves a gap in which the name
 * can start answering with a private address instead. Here the approved addresses
 * are handed to the connection directly, so the name is never looked up twice. The
 * host header and the certificate name still use the original name, so ordinary
 * name-based hosting and certificate checks keep working.
 */
export class NodeHttpTransport implements HttpTransport {
  async send(specification: HttpRequestSpecification): Promise<RawHttpResponse> {
    const isSecure = specification.url.protocol === "https:";
    const requestModule = isSecure ? https : http;
    const hostname = specification.url.hostname.replace(/^\[/, "").replace(/\]$/, "");

    if (specification.addresses.length === 0) {
      throw new TransportError("No approved address to connect to.");
    }

    return new Promise<RawHttpResponse>((resolve, reject) => {
      const request = requestModule.request(
        {
          protocol: specification.url.protocol,
          hostname,
          port: specification.url.port.length > 0 ? Number(specification.url.port) : undefined,
          path: `${specification.url.pathname}${specification.url.search}`,
          method: "GET",
          headers: { ...specification.headers, host: specification.url.host },
          lookup: pinnedLookup(specification.addresses),
          timeout: specification.timeoutMilliseconds,
          servername: isSecure ? hostname : undefined,
        },
        (response) => {
          collectBody(response, specification.maximumBodyBytes).then((body) => {
            resolve({
              statusCode: response.statusCode ?? 0,
              headers: singleValueHeaders(response.headers),
              body,
            });
          }, reject);
        },
      );

      const deadline = setTimeout(() => {
        request.destroy(new RequestTimeoutError(specification.timeoutMilliseconds));
      }, specification.timeoutMilliseconds);
      deadline.unref?.();

      request.on("timeout", () => {
        request.destroy(new RequestTimeoutError(specification.timeoutMilliseconds));
      });
      request.on("error", (cause) => {
        clearTimeout(deadline);
        reject(
          cause instanceof RequestTimeoutError
            ? cause
            : new TransportError(`Could not reach ${specification.url.host}: ${cause.message}`, {
                cause,
              }),
        );
      });
      request.on("close", () => {
        clearTimeout(deadline);
      });

      request.end();
    });
  }
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | { address: string; family: number }[],
  family?: number,
) => void;

/**
 * Answers every name lookup this one request makes with the approved addresses,
 * whatever the name is. The request only ever asks about its own host.
 */
function pinnedLookup(addresses: readonly ResolvedAddress[]) {
  return (_hostname: string, options: unknown, callback: LookupCallback): void => {
    const wantsAll =
      typeof options === "object" && options !== null && (options as { all?: boolean }).all === true;

    if (wantsAll) {
      callback(
        null,
        addresses.map((resolved) => ({ address: resolved.address, family: resolved.family })),
      );
      return;
    }

    const first = addresses[0];
    if (first === undefined) {
      const error: NodeJS.ErrnoException = new Error("No approved address to connect to.");
      error.code = "ENOTFOUND";
      callback(error, "");
      return;
    }
    callback(null, first.address, first.family);
  };
}

async function collectBody(
  response: http.IncomingMessage,
  maximumBodyBytes: number,
): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let collectedBytes = 0;

  try {
    for await (const chunk of response) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBufferView["buffer"]);
      collectedBytes += buffer.byteLength;
      if (collectedBytes > maximumBodyBytes) {
        response.destroy();
        throw new ResponseTooLargeError(maximumBodyBytes);
      }
      chunks.push(buffer);
    }
  } catch (cause) {
    if (cause instanceof ResponseTooLargeError || cause instanceof RequestTimeoutError) {
      throw cause;
    }
    throw new TransportError(`The response could not be read: ${describeCause(cause)}`, { cause });
  }

  return Buffer.concat(chunks);
}

function singleValueHeaders(
  headers: http.IncomingHttpHeaders,
): Readonly<Record<string, string>> {
  const flattened: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    flattened[name.toLowerCase()] = Array.isArray(value) ? (value[0] ?? "") : value;
  }
  return flattened;
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
