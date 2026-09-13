/** Ear tags are stored without accidental whitespace around the identifier. */
export function normalizeEarTag(value: string): string {
  return value.trim();
}

/**
 * Orders ear tags the way a farmer reads them: the numbers inside a tag by
 * value ("B-9" before "B-10"), ignoring case and accents.
 */
export function compareEarTags(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
