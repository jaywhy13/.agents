import { randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTE_LENGTH = 32;

/**
 * The lesson server listens on the loopback interface, so any other local process
 * can reach it. The token is the only thing that separates the learner's browser
 * from every other program on the machine, so it must be unpredictable.
 */
export function createAccessToken(): string {
  return randomBytes(TOKEN_BYTE_LENGTH).toString("base64url");
}

/** Compares in constant time so a caller cannot learn the token byte by byte. */
export function matchesAccessToken(expectedToken: string, presentedToken: unknown): boolean {
  if (typeof presentedToken !== "string" || presentedToken.length === 0) {
    return false;
  }

  const expectedBytes = Buffer.from(expectedToken, "utf8");
  const presentedBytes = Buffer.from(presentedToken, "utf8");

  if (expectedBytes.length !== presentedBytes.length) {
    return false;
  }

  return timingSafeEqual(expectedBytes, presentedBytes);
}
