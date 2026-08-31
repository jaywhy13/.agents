/**
 * The one place a voice request leaves this process.
 *
 * Both voice clients go through `sendProxyRequest`, so the deadline, the response
 * size bound, and the error shape are decided once instead of twice. `fetch` is
 * injected rather than reached for, which is what lets the tests drive real
 * `Response` objects through the same code the lesson runs.
 */

import type { AudioBytes } from "./voice-limits.ts";
import { LONGEST_PROXY_ERROR_DETAIL_CHARACTERS } from "./voice-limits.ts";
import {
  ProxyRequestFailedError,
  ProxyResponseTooLargeError,
  ProxyTimedOutError,
} from "./voice-errors.ts";

export interface ProxyRequestInit {
  readonly method: "POST";
  readonly headers: Record<string, string>;
  readonly body: FormData | string;
  readonly signal: AbortSignal;
}

/** Narrower than `fetch` on purpose: the voice path only ever posts. */
export type ProxyFetch = (url: string, init: ProxyRequestInit) => Promise<Response>;

export interface ProxyRequest {
  readonly url: string;
  /** Only used in messages, so an error never repeats the whole address. */
  readonly proxyPath: string;
  readonly authorizationHeaderValue: string;
  readonly body: FormData | string;
  /** Left out for multipart bodies: the runtime has to add its own boundary. */
  readonly contentType?: string;
  readonly timeoutMilliseconds: number;
  readonly largestResponseBytes: number;
}

export interface ProxyAnswer {
  readonly status: number;
  readonly contentType: string;
  readonly bytes: AudioBytes;
}

export async function sendProxyRequest(
  fetchFromProxy: ProxyFetch,
  request: ProxyRequest,
): Promise<ProxyAnswer> {
  const response = await fetchWithDeadline(fetchFromProxy, request);

  if (!response.ok) {
    throw new ProxyRequestFailedError(
      request.proxyPath,
      response.status,
      await readErrorDetail(response),
    );
  }

  const bytes = await readBodyWithinLimit(response, request.proxyPath, request.largestResponseBytes);

  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    bytes,
  };
}

async function fetchWithDeadline(
  fetchFromProxy: ProxyFetch,
  request: ProxyRequest,
): Promise<Response> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), request.timeoutMilliseconds);

  try {
    return await fetchFromProxy(request.url, {
      method: "POST",
      headers: proxyHeaders(request),
      body: request.body,
      signal: deadline.signal,
    });
  } catch (cause) {
    if (deadline.signal.aborted) {
      throw new ProxyTimedOutError(request.proxyPath, request.timeoutMilliseconds);
    }
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}

function proxyHeaders(request: ProxyRequest): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: request.authorizationHeaderValue,
    // The proxy caches aggressively by default; a transcript or a spoken line must
    // be the answer to this request, not to an earlier one.
    "Cache-Control": "no-cache",
  };
  if (request.contentType !== undefined) {
    headers["Content-Type"] = request.contentType;
  }
  return headers;
}

/**
 * Reads the body and stops the moment it passes the bound, rather than buffering
 * the whole thing and checking afterwards. `Content-Length` is checked first when
 * the proxy declares one, so an oversized answer costs nothing at all.
 */
export async function readBodyWithinLimit(
  response: Response,
  proxyPath: string,
  largestAllowedBytes: number,
): Promise<AudioBytes> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > largestAllowedBytes) {
    throw new ProxyResponseTooLargeError(proxyPath, largestAllowedBytes);
  }

  const body = response.body;
  if (body === null) {
    return new Uint8Array(0);
  }

  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    const part = chunk.value;
    if (part === undefined) {
      continue;
    }
    totalBytes += part.byteLength;
    if (totalBytes > largestAllowedBytes) {
      await reader.cancel();
      throw new ProxyResponseTooLargeError(proxyPath, largestAllowedBytes);
    }
    parts.push(part);
  }

  return joinParts(parts, totalBytes);
}

function joinParts(parts: readonly Uint8Array[], totalBytes: number): AudioBytes {
  const joined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  return joined;
}

/**
 * Keeps a short excerpt of the proxy's own complaint. Bounded because a failure
 * body is untrusted input, and truncated because the message is shown to a learner.
 */
async function readErrorDetail(response: Response): Promise<string> {
  let rawDetail: string;
  try {
    rawDetail = await response.text();
  } catch {
    return "(no detail)";
  }

  const collapsed = rawDetail.replace(/\s+/g, " ").trim();
  if (collapsed === "") {
    return "(no detail)";
  }
  if (collapsed.length <= LONGEST_PROXY_ERROR_DETAIL_CHARACTERS) {
    return collapsed;
  }
  return `${collapsed.slice(0, LONGEST_PROXY_ERROR_DETAIL_CHARACTERS)}…`;
}
