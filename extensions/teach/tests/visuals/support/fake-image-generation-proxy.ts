import { Buffer } from "node:buffer";

/**
 * Stands in for the Shopify AI proxy.
 *
 * Every test that needs an image goes through this one fake rather than patching
 * `fetch` inline, so the day the proxy's request or reply shape changes there is a
 * single place to change. It records what it was asked for, so a test can assert
 * the client sent the right thing without reaching inside the client.
 *
 * It builds real `Response` objects, which means the client's own body reading,
 * status handling and byte budget are all exercised for real.
 */

export const SMALLEST_VALID_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

export interface RecordedImageRequest {
  readonly url: string;
  readonly method: string;
  readonly authorization: string | null;
  readonly body: Record<string, unknown>;
}

export class FakeImageGenerationProxy {
  readonly requests: RecordedImageRequest[] = [];
  private nextResponse: () => Response = () => imageResponse();

  /** The fetch to hand to the client. Bound, so it can be passed as a value. */
  readonly fetch: typeof fetch = async (input, init) => {
    this.requests.push(recordRequest(input, init));
    return this.nextResponse();
  };

  answerWithImage(bytes: Uint8Array = SMALLEST_VALID_PNG_BYTES, revisedPrompt?: string): void {
    this.nextResponse = () => imageResponse(bytes, revisedPrompt);
  }

  answerWithStatus(status: number, body = "{}"): void {
    this.nextResponse = () => new Response(body, { status });
  }

  answerWithBody(body: string, headers: Record<string, string> = {}): void {
    this.nextResponse = () => new Response(body, { status: 200, headers });
  }

  answerByFailingToConnect(message = "network is unreachable"): void {
    this.nextResponse = () => {
      throw new TypeError(message);
    };
  }

  get onlyRequest(): RecordedImageRequest {
    const [firstRequest] = this.requests;
    if (firstRequest === undefined) {
      throw new Error("The proxy was never called.");
    }
    return firstRequest;
  }
}

export function imageResponse(
  bytes: Uint8Array = SMALLEST_VALID_PNG_BYTES,
  revisedPrompt?: string,
): Response {
  const image: Record<string, unknown> = { b64_json: Buffer.from(bytes).toString("base64") };
  if (revisedPrompt !== undefined) {
    image["revised_prompt"] = revisedPrompt;
  }
  return new Response(JSON.stringify({ data: [image] }), { status: 200 });
}

function recordRequest(input: Parameters<typeof fetch>[0], init: RequestInit | undefined): RecordedImageRequest {
  const headers = new Headers(init?.headers ?? {});
  return {
    url: String(input),
    method: init?.method ?? "GET",
    authorization: headers.get("authorization"),
    body: typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {},
  };
}
