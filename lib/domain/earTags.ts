/** Ear tags are stored without accidental whitespace around the identifier. */
export function normalizeEarTag(value: string): string {
  return value.trim();
}
