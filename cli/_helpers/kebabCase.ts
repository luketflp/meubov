/** Turn a free-form migration name into a drizzle-friendly kebab-case slug. */
export function toKebabCase(str: string): string {
  return str
    .replace(/_/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .toLowerCase();
}
