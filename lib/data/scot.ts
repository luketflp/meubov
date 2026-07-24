/**
 * REAL arroba quote source backed by Scot Consultoria's public boi gordo page.
 *
 * The "Mercado Físico" table publishes the daily fat steer price per praça; we
 * read the "MS C. Grande" row (Campo Grande-MS, reference praça of Mato Grosso
 * do Sul), "Preços Brutos · à vista" column, in R$/@. It is a daily snapshot:
 * there is no public history, so the payload carries changePct = null and an
 * empty series (screens fall back to the illustrative chart, labeled as such).
 *
 * This module is pure fetch-shape + parsing (server-safe, unit-testable); the
 * HTTP boundary lives in `app/api/market/quote/route.ts`.
 */
import type { ArrobaQuote, MarketQuotePayload } from "@/lib/data/market";

export const SCOT_QUOTE_URL = "https://www.scotconsultoria.com.br/cotacoes/boi-gordo/";

/** Praça row read from the Mercado Físico table. */
export const SCOT_PRACA = "MS C. Grande";

/** User-visible label of where the quote comes from. */
export const SCOT_SOURCE_LABEL = "boi gordo à vista C. Grande-MS · Scot Consultoria";

/** "31/07/2026" → "2026-07-31". */
function brDateToIso(br: string): string {
  const [day, month, year] = br.split("/");
  return `${year}-${month}-${day}`;
}

/** pt-BR decimal ("1.336,50") → number, or null when not numeric. */
function brNumber(text: string): number | null {
  const value = Number(text.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

/**
 * Extracts the daily MS quote from the boi gordo page HTML: the date in the
 * "Mercado Físico - DD/MM/YYYY" header and the first price cell (Preços
 * Brutos · à vista) of the praça row. Returns null when the page shape
 * changed or the praça is missing — callers fall back to the mock.
 */
export function parseScotMsQuote(html: string, praca: string = SCOT_PRACA): ArrobaQuote | null {
  const dateMatch = html.match(/Mercado F(?:ísico|&iacute;sico)\s*-\s*(\d{2}\/\d{2}\/\d{4})/);
  if (!dateMatch) return null;

  const tableStart = html.indexOf(dateMatch[0]);
  const tableEnd = html.indexOf("</table>", tableStart);
  if (tableEnd === -1) return null;
  const table = html.slice(tableStart, tableEnd);

  const rowMatch = table.match(
    new RegExp(
      `<td[^>]*>\\s*${praca.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*<\\/td>\\s*<td[^>]*>([\\d.,]+)<\\/td>`
    )
  );
  if (!rowMatch) return null;

  const value = brNumber(rowMatch[1]);
  if (value === null || value <= 0) return null;

  return { date: brDateToIso(dateMatch[1]), value };
}

/** Wraps the daily snapshot into the payload the UI consumes. */
export function buildScotQuotePayload(quote: ArrobaQuote): MarketQuotePayload {
  return {
    current: quote,
    changePct: null,
    series: [],
    source: SCOT_SOURCE_LABEL,
  };
}
