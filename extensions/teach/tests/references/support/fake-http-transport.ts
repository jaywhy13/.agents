import type {
  HttpRequestSpecification,
  HttpTransport,
  RawHttpResponse,
} from "../../../src/references/http-transport.ts";
import {
  RequestTimeoutError,
  ResponseTooLargeError,
} from "../../../src/references/http-transport.ts";

export interface ScriptedResponse {
  readonly statusCode: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  /** Bytes the server claims to send, used to test the size limit without big strings. */
  readonly bodyByteLength?: number;
  readonly timesOut?: boolean;
}

/**
 * Answers requests with responses the test wrote out, and keeps every request so a
 * test can check which addresses were actually contacted. It copies the two
 * failures a real transport owns — too large and too slow — so the client above it
 * is exercised the same way it would be against a real server.
 */
export class FakeHttpTransport implements HttpTransport {
  readonly sentRequests: HttpRequestSpecification[] = [];
  private readonly responsesByUrl = new Map<string, ScriptedResponse[]>();

  respondTo(url: string, response: ScriptedResponse): this {
    const existing = this.responsesByUrl.get(url) ?? [];
    this.responsesByUrl.set(url, [...existing, response]);
    return this;
  }

  get requestedUrls(): string[] {
    return this.sentRequests.map((request) => request.url.href);
  }

  get contactedAddresses(): string[] {
    return this.sentRequests.flatMap((request) =>
      request.addresses.map((resolved) => resolved.address),
    );
  }

  async send(specification: HttpRequestSpecification): Promise<RawHttpResponse> {
    this.sentRequests.push(specification);

    const scripted = this.responsesByUrl.get(specification.url.href)?.shift();
    if (scripted === undefined) {
      throw new Error(`No scripted response for ${specification.url.href}`);
    }
    if (scripted.timesOut === true) {
      throw new RequestTimeoutError(specification.timeoutMilliseconds);
    }

    const body = Buffer.from(scripted.body ?? "", "utf8");
    const claimedByteLength = scripted.bodyByteLength ?? body.byteLength;
    if (claimedByteLength > specification.maximumBodyBytes) {
      throw new ResponseTooLargeError(specification.maximumBodyBytes);
    }

    return {
      statusCode: scripted.statusCode,
      headers: scripted.headers ?? { "content-type": "text/plain" },
      body,
    };
  }
}
