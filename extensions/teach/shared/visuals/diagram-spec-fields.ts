/**
 * Field-level validation for the visual beat kinds.
 *
 * A diagram spec arrives from the teaching model, so every field is checked before
 * it becomes a typed value object. The checks live here so each parse branch reads
 * as the list of fields that value object has.
 *
 * Visual beats validate lengths as well as shapes. A label that does not fit in a
 * box is not a drawing problem to solve later; it is a sign the lesson is trying to
 * say too much in one shape, and it is refused here with a message that says so.
 *
 * This module is pure: no node built-ins, so the lesson page can use it too.
 */

export class InvalidGraphDiagramError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGraphDiagramError";
  }
}

/** Ids are put into element ids and file names, so they stay to a safe alphabet. */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function asDiagramRecord(candidate: unknown, label: string): Record<string, unknown> {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new InvalidGraphDiagramError(
      `Expected ${label} to be an object, received ${describeValue(candidate)}`,
    );
  }
  return candidate as Record<string, unknown>;
}

export function requireIdentifier(value: unknown, fieldName: string): string {
  const text = requireNonBlankText(value, fieldName);
  if (!IDENTIFIER_PATTERN.test(text)) {
    throw new InvalidGraphDiagramError(
      `Field ${fieldName} must be 1 to 64 letters, digits, hyphens or underscores, starting with a letter or digit.`,
    );
  }
  return text;
}

export function requireNonBlankText(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidGraphDiagramError(`Field ${fieldName} must be non-blank text.`);
  }
  return value;
}

/**
 * A label is drawn inside a shape, so it is both trimmed and capped. Trimming is
 * part of the value, not a display concern: two labels that differ only by spacing
 * must compile to the same drawing.
 */
export function requireLabel(value: unknown, fieldName: string, longestCharacters: number): string {
  const label = requireNonBlankText(value, fieldName).trim();
  if (label.length > longestCharacters) {
    throw new InvalidGraphDiagramError(
      `Field ${fieldName} must be at most ${longestCharacters} characters. Say it in fewer words, or split the idea across two shapes.`,
    );
  }
  if (containsControlCharacter(label)) {
    throw new InvalidGraphDiagramError(`Field ${fieldName} must not contain control characters.`);
  }
  return label;
}

/** Fields the teaching model may leave out. Absent becomes null so shapes match. */
export function optionalLabel(
  value: unknown,
  fieldName: string,
  longestCharacters: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return requireLabel(value, fieldName, longestCharacters);
}

export function requireMemberOf<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new InvalidGraphDiagramError(
      `Field ${fieldName} must be one of: ${allowed.join(", ")}.`,
    );
  }
  return value as T;
}

export function optionalMemberOf<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
  whenAbsent: T,
): T {
  if (value === undefined || value === null) {
    return whenAbsent;
  }
  return requireMemberOf(value, fieldName, allowed);
}

/**
 * A counting number the teaching model may leave out. Absent becomes `whenAbsent`,
 * so every caller sees a number rather than "a number or nothing".
 */
export function optionalCountingNumber(
  value: unknown,
  fieldName: string,
  whenAbsent: number,
  mostAllowed: number,
): number {
  if (value === undefined || value === null) {
    return whenAbsent;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > mostAllowed) {
    throw new InvalidGraphDiagramError(
      `Field ${fieldName} must be a whole number from 1 to ${mostAllowed}, received ${describeValue(value)}`,
    );
  }
  return value;
}

export function requireListWithinLimit(
  value: unknown,
  fieldName: string,
  fewestEntries: number,
  mostEntries: number,
): readonly unknown[] {
  const entries = value === undefined || value === null ? [] : value;
  if (!Array.isArray(entries)) {
    throw new InvalidGraphDiagramError(`Field ${fieldName} must be a list.`);
  }
  if (entries.length < fewestEntries || entries.length > mostEntries) {
    throw new InvalidGraphDiagramError(
      `Field ${fieldName} must list ${fewestEntries} to ${mostEntries} entries, received ${entries.length}.`,
    );
  }
  return entries;
}

export function requireIdentifierList(
  value: unknown,
  fieldName: string,
  fewestEntries: number,
  mostEntries: number,
): readonly string[] {
  return requireListWithinLimit(value, fieldName, fewestEntries, mostEntries).map((entry, index) =>
    requireIdentifier(entry, `${fieldName}[${index}]`),
  );
}

export function describeValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null) return "null";
  return typeof value;
}

function containsControlCharacter(text: string): boolean {
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 0x20 || codePoint === 0x7f) {
      return true;
    }
  }
  return false;
}
