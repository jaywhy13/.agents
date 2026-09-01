import type { IncomingMessage } from "node:http";

/**
 * Reads a request body, and stops the moment it is over budget.
 *
 * The lesson server is reachable by every other program on this machine, so a body
 * is bounded while it arrives rather than buffered and measured afterwards. A caller
 * that sends more than the budget is cut off at the budget, not at whatever it chose
 * to send. A body that stops arriving half way is cut off by the deadline, so one
 * stalled upload cannot hold a connection open for the life of the pi session.
 */

export type RequestBodyOutcome =
  | { readonly kind: "read"; readonly bytes: Uint8Array }
  | { readonly kind: "too_large"; readonly limitBytes: number }
  | { readonly kind: "timed_out"; readonly timeoutMilliseconds: number }
  | { readonly kind: "failed"; readonly reason: string };

export interface RequestBodyLimits {
  readonly largestBytes: number;
  readonly timeoutMilliseconds: number;
}

export async function readRequestBody(
  request: IncomingMessage,
  limits: RequestBodyLimits,
): Promise<RequestBodyOutcome> {
  const declaredLength = Number(request.headers["content-length"] ?? Number.NaN);
  if (Number.isFinite(declaredLength) && declaredLength > limits.largestBytes) {
    // Refused before a byte is read, so an oversized upload costs nothing.
    return { kind: "too_large", limitBytes: limits.largestBytes };
  }

  return new Promise<RequestBodyOutcome>((resolve) => {
    const chunks: Buffer[] = [];
    let bytesRead = 0;
    let settled = false;

    const finish = (outcome: RequestBodyOutcome): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(deadline);
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
      if (outcome.kind !== "read") {
        // Nothing more will be read, so let go of the connection rather than
        // draining a body that has already been refused.
        request.destroy();
      }
      resolve(outcome);
    };

    const onData = (chunk: Buffer): void => {
      bytesRead += chunk.byteLength;
      if (bytesRead > limits.largestBytes) {
        finish({ kind: "too_large", limitBytes: limits.largestBytes });
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = (): void => {
      const whole = Buffer.concat(chunks);
      finish({
        kind: "read",
        bytes: new Uint8Array(whole.buffer, whole.byteOffset, whole.byteLength),
      });
    };
    const onError = (cause: Error): void => {
      finish({ kind: "failed", reason: cause.message });
    };

    const deadline = setTimeout(
      () => finish({ kind: "timed_out", timeoutMilliseconds: limits.timeoutMilliseconds }),
      limits.timeoutMilliseconds,
    );

    request.on("data", onData);
    request.on("end", onEnd);
    request.on("error", onError);
  });
}
