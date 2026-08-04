/**
 * REAL arroba quote source backed by IPEADATA's open OData4 API (no key needed).
 *
 * Series DERAL12_PRBGO12 — "Preço médio recebido pelo agricultor, boi gordo,
 * arroba, PR" (Seab/Deral-PR) — monthly average in R$/@, active and public.
 * It is the app's historical series (merged with Scot's daily current price by
 * mergeQuotePayload): the CEPEA/ESALQ daily indicator sits behind Cloudflare
 * and B3/Scot histories require licenses, so this is the best open series.
 *
 * This module is pure fetch-shape + parsing (server-safe, unit-testable); the
 * HTTP boundary lives in `app/api/market/quote/route.ts`.
 */
import type { ArrobaQuote } from "@/lib/data/market";

export const IPEADATA_SERIES_CODE = "DERAL12_PRBGO12";

/** OData endpoint with every point of the series (ascending by date). */
export const IPEADATA_SERIES_URL = `http://www.ipeadata.gov.br/api/odata4/ValoresSerie(SERCODIGO='${IPEADATA_SERIES_CODE}')`;

/** User-visible label of where the quote comes from. */
export const IPEADATA_SOURCE_LABEL = "Seab/Deral-PR · Ipeadata";

/**
 * Parses the OData response into an ascending ArrobaQuote series. Tolerant to
 * the API's shape: entries missing a numeric VALVALOR or a VALDATA are dropped.
 * VALDATA arrives as "YYYY-MM-DDT00:00:00-03:00" — only the ISO date is kept.
 */
export function parseIpeadataSeries(payload: unknown): ArrobaQuote[] {
  if (typeof payload !== "object" || payload === null) return [];
  const rows = (payload as { value?: unknown }).value;
  if (!Array.isArray(rows)) return [];

  const series: ArrobaQuote[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const { VALDATA, VALVALOR } = row as { VALDATA?: unknown; VALVALOR?: unknown };
    if (typeof VALDATA !== "string" || VALDATA.length < 10) continue;
    if (typeof VALVALOR !== "number" || !Number.isFinite(VALVALOR)) continue;
    series.push({
      date: VALDATA.slice(0, 10),
      value: Math.round(VALVALOR * 100) / 100,
    });
  }
  return series;
}

