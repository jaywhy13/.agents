/**
 * The one Shopify AI Proxy credential this extension uses.
 *
 * Two halves of a lesson talk to the proxy: the voice path, for speech and
 * transcription, and the picture path, for illustrations. They used to read the
 * environment differently — voice took either variable pi exports, pictures only the
 * raw key — so a pi session started with only `PI_PROXY_AUTH_HEADER` could speak but
 * could not draw. One reader means one answer to "does this session have the
 * credential", and one answer to what the `Authorization` header should be.
 *
 * pi exports both `PI_PROXY_API_KEY` and `PI_PROXY_AUTH_HEADER`. The header form is
 * what the proxy expects verbatim, so it wins when both are set: a future change to
 * the credential scheme then needs no code change here. A bare key is wrapped in
 * `Bearer `.
 *
 * The credential never leaves the pi process. The lesson page asks the lesson server
 * for audio, transcripts and pictures, and the lesson server is the only thing that
 * calls the proxy.
 */

export const API_KEY_VARIABLE = "PI_PROXY_API_KEY";
export const AUTHORIZATION_HEADER_VARIABLE = "PI_PROXY_AUTH_HEADER";

export type Environment = Readonly<Record<string, string | undefined>>;

export class MissingProxyCredentialError extends Error {
  constructor() {
    super(
      `There is no Shopify AI Proxy credential in this pi session. Start pi through \`devx pi\` so ${AUTHORIZATION_HEADER_VARIABLE} or ${API_KEY_VARIABLE} is set.`,
    );
    this.name = "MissingProxyCredentialError";
  }
}

/**
 * The whole `Authorization` header value, or null when this pi session has no
 * credential. Null rather than a throw: a lesson with no voice and no pictures is
 * still a lesson, so the callers switch those halves off rather than refusing to run.
 */
export function readProxyCredential(environment: Environment): string | null {
  const headerValue = nonBlankOrNull(environment[AUTHORIZATION_HEADER_VARIABLE]);
  if (headerValue !== null) {
    return headerValue;
  }

  const apiKey = nonBlankOrNull(environment[API_KEY_VARIABLE]);
  return apiKey === null ? null : `Bearer ${apiKey}`;
}

export function hasProxyCredential(environment: Environment): boolean {
  return readProxyCredential(environment) !== null;
}

/** For the callers that cannot carry on without it, such as a client being built. */
export function requireProxyCredential(environment: Environment): string {
  const credential = readProxyCredential(environment);
  if (credential === null) {
    throw new MissingProxyCredentialError();
  }
  return credential;
}

function nonBlankOrNull(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
