/**
 * Generates an illustration through Shopify's AI proxy, and nothing else.
 *
 * The proxy at `https://proxy.shopify.ai` puts several image providers behind one
 * OpenAI-shaped address. `POST /v1/images/generations` takes a prompt and returns
 * the image base64-encoded in the JSON body. Authorisation is the whole
 * `Authorization` header value, read once by `shopify-proxy-credential.ts` — the
 * same value the voice path sends, so a session that can speak can also draw.
 *
 * This is the only image provider the lesson may use. No other host is reachable
 * from here, and `fetch` is a constructor argument, so a test never makes a live
 * call and a caller cannot quietly point this at somewhere else.
 *
 * The response is read against a byte budget rather than swallowed whole. A local
 * lesson has no business buffering an unbounded reply from the network, and a
 * declared length that is already over budget is refused before a byte is read.
 */

import { Buffer } from "node:buffer";

import {
  API_KEY_VARIABLE,
  AUTHORIZATION_HEADER_VARIABLE,
} from "../proxy/shopify-proxy-credential.ts";
import type { IllustrationStyle, ImageSize } from "../../shared/visuals/illustration-request.ts";
import {
  ILLUSTRATION_STYLES,
  IMAGE_SIZES,
  LONGEST_PROMPT_CHARACTERS,
} from "../../shared/visuals/illustration-request.ts";

// The sizes, the styles and the prompt limit are part of what a lesson may ask for,
// so they live in `shared/` with the illustration request and travel to the page
// with it. They are re-exported here because this is where a caller that is about
// to speak to the proxy already looks.
export type { IllustrationStyle, ImageSize };
export { ILLUSTRATION_STYLES, IMAGE_SIZES, LONGEST_PROMPT_CHARACTERS };

export const PROXY_IMAGE_GENERATION_URL = "https://proxy.shopify.ai/v1/images/generations";
export const IMAGE_MODEL = "gpt-image-1.5";

/** The whole JSON reply, base64 image included. */
export const LARGEST_RESPONSE_BYTES = 16 * 1024 * 1024;
export const LARGEST_IMAGE_BYTES = 8 * 1024 * 1024;

export interface ImageGenerationRequest {
  readonly prompt: string;
  readonly size: ImageSize;
  readonly style: IllustrationStyle;
}

export interface GeneratedImage {
  readonly bytes: Uint8Array;
  readonly mediaType: "image/png";
  readonly model: string;
  /** What the provider decided to draw, when it says. Useful in a failure report. */
  readonly revisedPrompt: string | null;
}

export type ImageGenerationFailure =
  | "invalid_request"
  | "not_authorised"
  | "provider_refused"
  | "provider_unavailable"
  | "response_too_large"
  | "unreadable_response";

export class ImageGenerationError extends Error {
  readonly failure: ImageGenerationFailure;

  constructor(failure: ImageGenerationFailure, message: string) {
    super(message);
    this.name = "ImageGenerationError";
    this.failure = failure;
  }
}

export interface ShopifyAiProxyImageClientOptions {
  /** Injected so no test ever reaches the network. */
  readonly fetchImplementation: typeof fetch;
  /** The whole `Authorization` header value, including the `Bearer ` prefix. */
  readonly authorizationHeaderValue: string;
}

export class ShopifyAiProxyImageClient {
  private readonly fetchImplementation: typeof fetch;
  private readonly authorizationHeaderValue: string;

  constructor(options: ShopifyAiProxyImageClientOptions) {
    if (options.authorizationHeaderValue.trim().length === 0) {
      throw new ImageGenerationError(
        "not_authorised",
        `No Shopify AI Proxy credential. Start pi through \`devx pi\` so ${AUTHORIZATION_HEADER_VARIABLE} or ${API_KEY_VARIABLE} is set.`,
      );
    }
    this.fetchImplementation = options.fetchImplementation;
    this.authorizationHeaderValue = options.authorizationHeaderValue;
  }

  async generateImage(
    request: ImageGenerationRequest,
    abortSignal?: AbortSignal,
  ): Promise<GeneratedImage> {
    const prompt = fullPromptFor(request);

    const response = await this.askTheProxy(prompt, request.size, abortSignal);
    requireSuccessfulResponse(response);

    const body = parseGenerationBody(await readTextWithinBudget(response, LARGEST_RESPONSE_BYTES));

    return {
      bytes: decodePngWithinBudget(body.base64Image),
      mediaType: "image/png",
      model: IMAGE_MODEL,
      revisedPrompt: body.revisedPrompt,
    };
  }

  private async askTheProxy(
    prompt: string,
    size: ImageSize,
    abortSignal: AbortSignal | undefined,
  ): Promise<Response> {
    const requestBody = JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      size,
      n: 1,
      output_format: "png",
    });

    try {
      return await this.fetchImplementation(PROXY_IMAGE_GENERATION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.authorizationHeaderValue,
          "Cache-Control": "no-cache",
        },
        body: requestBody,
        ...(abortSignal === undefined ? {} : { signal: abortSignal }),
      });
    } catch (cause) {
      throw new ImageGenerationError(
        "provider_unavailable",
        `Could not reach the Shopify AI proxy: ${describeCause(cause)}`,
      );
    }
  }
}

/**
 * Validates the request and joins the prompt to its style wording. Exported so the
 * illustration service can hash exactly what would be sent, without sending it.
 */
export function fullPromptFor(request: ImageGenerationRequest): string {
  const prompt = requirePrompt(request.prompt);
  requireKnownSize(request.size);

  return `${prompt}\n\n${styleInstructionFor(request.style)}`;
}

/** One explicit branch per style, so a new style must state how it is drawn. */
function styleInstructionFor(style: IllustrationStyle): string {
  switch (style) {
    case "diagram_sketch":
      return "Draw this as a clean explanatory diagram: flat shapes, plain background, clear labels, no decoration.";
    case "flat_illustration":
      return "Draw this as a simple flat vector illustration with a limited palette and no text.";
    case "photograph":
      return "Render this as a plain, well-lit photograph with a neutral background and no text.";
    default:
      throw new ImageGenerationError(
        "invalid_request",
        `Field style must be one of: ${ILLUSTRATION_STYLES.join(", ")}.`,
      );
  }
}

function requirePrompt(prompt: unknown): string {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new ImageGenerationError("invalid_request", "Field prompt must be non-blank text.");
  }
  const trimmed = prompt.trim();
  if (trimmed.length > LONGEST_PROMPT_CHARACTERS) {
    throw new ImageGenerationError(
      "invalid_request",
      `Field prompt must be at most ${LONGEST_PROMPT_CHARACTERS} characters, received ${trimmed.length}.`,
    );
  }
  return trimmed;
}

function requireKnownSize(size: unknown): ImageSize {
  if (typeof size !== "string" || !(IMAGE_SIZES as readonly string[]).includes(size)) {
    throw new ImageGenerationError(
      "invalid_request",
      `Field size must be one of: ${IMAGE_SIZES.join(", ")}.`,
    );
  }
  return size as ImageSize;
}

/** One explicit branch per status family, so each failure keeps its own name. */
function requireSuccessfulResponse(response: Response): void {
  if (response.ok) {
    return;
  }
  if (response.status === 401 || response.status === 403) {
    throw new ImageGenerationError(
      "not_authorised",
      `The Shopify AI proxy refused the key (${response.status}). Start pi through \`devx pi\` for a fresh one.`,
    );
  }
  if (response.status === 400 || response.status === 422) {
    throw new ImageGenerationError(
      "provider_refused",
      `The Shopify AI proxy refused the prompt (${response.status}).`,
    );
  }
  throw new ImageGenerationError(
    "provider_unavailable",
    `The Shopify AI proxy answered ${response.status}.`,
  );
}

interface GenerationBody {
  readonly base64Image: string;
  readonly revisedPrompt: string | null;
}

function parseGenerationBody(text: string): GenerationBody {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new ImageGenerationError(
      "unreadable_response",
      `The Shopify AI proxy answered with something that is not JSON: ${describeCause(cause)}`,
    );
  }

  const firstImage = firstImageRecord(parsed);
  const base64Image = firstImage["b64_json"];
  if (typeof base64Image !== "string" || base64Image.length === 0) {
    throw new ImageGenerationError(
      "unreadable_response",
      "The Shopify AI proxy answered without an image in data[0].b64_json.",
    );
  }

  const revisedPrompt = firstImage["revised_prompt"];
  return {
    base64Image,
    revisedPrompt: typeof revisedPrompt === "string" ? revisedPrompt : null,
  };
}

function firstImageRecord(parsed: unknown): Record<string, unknown> {
  const images =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)["data"]
      : undefined;
  const firstImage = Array.isArray(images) ? images[0] : undefined;

  if (typeof firstImage !== "object" || firstImage === null || Array.isArray(firstImage)) {
    throw new ImageGenerationError(
      "unreadable_response",
      "The Shopify AI proxy answered without a data list holding an image.",
    );
  }
  return firstImage as Record<string, unknown>;
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const PNG_MAGIC_BYTES = [0x89, 0x50, 0x4e, 0x47] as const;

function decodePngWithinBudget(base64Image: string): Uint8Array {
  if (!BASE64_PATTERN.test(base64Image)) {
    throw new ImageGenerationError(
      "unreadable_response",
      "The image the Shopify AI proxy returned is not base64.",
    );
  }
  // Four base64 characters carry three bytes, so the decoded size is known before
  // any memory is spent decoding it.
  if ((base64Image.length / 4) * 3 > LARGEST_IMAGE_BYTES) {
    throw new ImageGenerationError(
      "response_too_large",
      `The image is larger than the ${LARGEST_IMAGE_BYTES} byte limit.`,
    );
  }

  const bytes = new Uint8Array(Buffer.from(base64Image, "base64"));
  if (bytes.length > LARGEST_IMAGE_BYTES) {
    throw new ImageGenerationError(
      "response_too_large",
      `The image is larger than the ${LARGEST_IMAGE_BYTES} byte limit.`,
    );
  }
  if (!startsWithPngMagicBytes(bytes)) {
    throw new ImageGenerationError(
      "unreadable_response",
      "The image the Shopify AI proxy returned is not a PNG.",
    );
  }
  return bytes;
}

function startsWithPngMagicBytes(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_MAGIC_BYTES.length) {
    return false;
  }
  return PNG_MAGIC_BYTES.every((expected, index) => bytes[index] === expected);
}

/**
 * Reads the body in chunks and stops the moment the budget is passed, so a reply
 * far larger than expected costs the budget rather than however much was sent.
 */
async function readTextWithinBudget(response: Response, budgetBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declaredLength) && declaredLength > budgetBytes) {
    throw new ImageGenerationError(
      "response_too_large",
      `The Shopify AI proxy declared ${declaredLength} bytes, over the ${budgetBytes} byte limit.`,
    );
  }

  const body = response.body;
  if (body === null) {
    return textWithinBudget(await response.text(), budgetBytes);
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      bytesRead += value.byteLength;
      if (bytesRead > budgetBytes) {
        throw new ImageGenerationError(
          "response_too_large",
          `The Shopify AI proxy sent more than the ${budgetBytes} byte limit.`,
        );
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

function textWithinBudget(text: string, budgetBytes: number): string {
  if (Buffer.byteLength(text, "utf8") > budgetBytes) {
    throw new ImageGenerationError(
      "response_too_large",
      `The Shopify AI proxy sent more than the ${budgetBytes} byte limit.`,
    );
  }
  return text;
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
