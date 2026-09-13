/**
 * Optional free text of the semen forms (code, raça, central, fornecedor) as it
 * is stored: trimmed, and null when nothing is left of it.
 */

/** Trimmed text, or null when it is absent or blank. */
export function textOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
