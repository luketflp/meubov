/**
 * The lançamento's Valor as typed in pt-BR: "3.240,50", "3240,5", "3240.5" and
 * "3.240" (thousands) all parse; NaN when it is not a number.
 */
export function parseAmount(text: string): number {
  const clean = text.replace(/\s|R\$/g, "");
  if (clean === "") return Number.NaN;
  if (clean.includes(",")) return Number(clean.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(clean)) return Number(clean.replace(/\./g, ""));
  return Number(clean);
}
