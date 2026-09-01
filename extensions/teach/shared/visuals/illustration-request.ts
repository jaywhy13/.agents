/**
 * What a lesson may ask for a picture of, as a checked value object.
 *
 * This lives in `shared/` rather than beside the proxy client because the beat that
 * carries an illustration travels to the browser, so the page needs the same type
 * and the same limits. It is pure: no node built-ins, no network.
 *
 * The style is a fixed name rather than free text on purpose. A lesson picks a
 * style; it never writes art direction, so a prompt cannot smuggle extra
 * instructions in through a style field.
 */

/** Sizes the proxy's image models accept. Anything else is refused before sending. */
export const IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;

export type ImageSize = (typeof IMAGE_SIZES)[number];

export const ILLUSTRATION_STYLES = ["diagram_sketch", "flat_illustration", "photograph"] as const;

export type IllustrationStyle = (typeof ILLUSTRATION_STYLES)[number];

export const LONGEST_PROMPT_CHARACTERS = 1_000;
export const LONGEST_ALTERNATIVE_TEXT_CHARACTERS = 300;

/** What the illustration is of. Also what its cache key is derived from. */
export interface IllustrationRequest {
  readonly prompt: string;
  readonly size: ImageSize;
  readonly style: IllustrationStyle;
  /** What a learner who cannot see the picture is told instead. Never optional. */
  readonly alternativeText: string;
}

export class InvalidIllustrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidIllustrationError";
  }
}

export function isImageSize(candidate: unknown): candidate is ImageSize {
  return typeof candidate === "string" && (IMAGE_SIZES as readonly string[]).includes(candidate);
}

export function isIllustrationStyle(candidate: unknown): candidate is IllustrationStyle {
  return (
    typeof candidate === "string" && (ILLUSTRATION_STYLES as readonly string[]).includes(candidate)
  );
}

export function parseIllustrationRequest(candidate: unknown): IllustrationRequest {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new InvalidIllustrationError("An illustration request must be an object.");
  }
  const record = candidate as Record<string, unknown>;

  const size = record["size"];
  if (!isImageSize(size)) {
    throw new InvalidIllustrationError(
      `Field size must be one of: ${IMAGE_SIZES.join(", ")}.`,
    );
  }

  const style = record["style"];
  if (!isIllustrationStyle(style)) {
    throw new InvalidIllustrationError(
      `Field style must be one of: ${ILLUSTRATION_STYLES.join(", ")}.`,
    );
  }

  return {
    prompt: requireBoundedText(record["prompt"], "prompt", LONGEST_PROMPT_CHARACTERS),
    size,
    style,
    alternativeText: requireBoundedText(
      record["alternativeText"],
      "alternativeText",
      LONGEST_ALTERNATIVE_TEXT_CHARACTERS,
    ),
  };
}

function requireBoundedText(value: unknown, fieldName: string, longest: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidIllustrationError(`Field ${fieldName} must be non-blank text.`);
  }
  const text = value.trim();
  if (text.length > longest) {
    throw new InvalidIllustrationError(
      `Field ${fieldName} must be at most ${longest} characters, received ${text.length}.`,
    );
  }
  return text;
}
