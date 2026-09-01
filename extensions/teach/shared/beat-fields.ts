/**
 * Field-level validation shared by every beat parse branch.
 *
 * A beat arrives either from the teaching model or from the beat log on disk, so
 * every field is checked before it becomes a typed beat. Keeping the checks here
 * means each parse branch reads as the list of fields that kind of beat has.
 */

export class InvalidBeatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBeatError";
  }
}

export function asBeatRecord(candidate: unknown, label: string): Record<string, unknown> {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new InvalidBeatError(
      `Expected ${label} to be an object, received ${describeValue(candidate)}`,
    );
  }
  return candidate as Record<string, unknown>;
}

export function requireNonBlankText(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidBeatError(`Field ${fieldName} must be non-blank text.`);
  }
  return value;
}

/**
 * Fields the teaching model may leave out, such as the full form of a term that is
 * not an acronym. Absent becomes null so the stored beat has one shape, but a
 * field that is present and blank is still a mistake worth naming.
 */
export function optionalText(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return requireNonBlankText(value, fieldName);
}

export function requireNonEmptyTextList(value: unknown, fieldName: string): readonly string[] {
  const entries = requireTextList(value, fieldName);
  if (entries.length === 0) {
    throw new InvalidBeatError(`Field ${fieldName} must list at least one entry.`);
  }
  return entries;
}

export function requireTextList(value: unknown, fieldName: string): readonly string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new InvalidBeatError(`Field ${fieldName} must be a list.`);
  }
  return value.map((entry, index) => requireNonBlankText(entry, `${fieldName}[${index}]`));
}

export function requirePositiveInteger(value: unknown, fieldName: string): number {
  return requireIntegerInRange(value, fieldName, 1, Number.MAX_SAFE_INTEGER);
}

export function requireIntegerInRange(
  value: unknown,
  fieldName: string,
  lowest: number,
  highest: number,
): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < lowest || value > highest) {
    throw new InvalidBeatError(
      `Field ${fieldName} must be a whole number from ${lowest} to ${highest}.`,
    );
  }
  return value;
}

export function requireIsoTimestamp(value: unknown, fieldName: string): string {
  const text = requireNonBlankText(value, fieldName);
  if (Number.isNaN(Date.parse(text))) {
    throw new InvalidBeatError(`Field ${fieldName} must be an ISO 8601 timestamp.`);
  }
  return text;
}

export function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new InvalidBeatError(`Field ${fieldName} must be true or false.`);
  }
  return value;
}

export function requireMemberOf<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new InvalidBeatError(`Field ${fieldName} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

export function requireList(value: unknown, fieldName: string): readonly unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new InvalidBeatError(`Field ${fieldName} must be a list.`);
  }
  return value;
}

export function describeValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null) return "null";
  return typeof value;
}
