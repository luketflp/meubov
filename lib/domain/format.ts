/**
 * Numeric formatting in the pt-BR standard (decimal comma, thousands dot).
 */

/**
 * Formats a number in the pt-BR standard with a fixed number of decimal places.
 */
export function formatNumber(n: number, decimalPlaces = 0): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(n);
}

/**
 * Formats a value in reais, e.g.: "R$ 1.234,56".
 */
export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

/**
 * Formats a weight in kilograms, e.g.: "512 kg".
 */
export function formatKg(n: number): string {
  return `${formatNumber(n)} kg`;
}

/**
 * Formats a value in arrobas with 1 decimal place, e.g.: "16,1 @".
 */
export function formatArroba(n: number): string {
  return `${formatNumber(n, 1)} @`;
}

/**
 * Formats a percentage with up to 2 decimal places, e.g.: "48,5%".
 */
export function formatPercent(n: number): string {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n)}%`;
}
