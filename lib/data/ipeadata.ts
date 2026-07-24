/**
 * REAL arroba quote source backed by IPEADATA's open OData4 API (no key needed).
 *
 * Series DERAL12_PRBGO12 — "Preço médio recebido pelo agricultor, boi gordo,
 * arroba, PR" (Seab/Deral-PR) — monthly average in R$/@, active and public. It
 * is the realization of the `QuoteSource` swap documented in `lib/data/market.ts`:
 * the CEPEA/ESALQ daily indicator sits behind Cloudflare and B3/Scot require
 * licenses, so this is the best open series available.
 *
 * This module is pure fetch-shape + parsing (server-safe, unit-testable); the
 * HTTP boundary lives in `app/api/market/quote/route.ts`.
 */
import type { ArrobaQuote, MarketQuotePayload } from "@/lib/data/market";

/** Re-export for compatibility: the payload contract lives in lib/data/market. */
export type { MarketQuotePayload } from "@/lib/data/market";

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

/**
 * Consolidates a parsed series into the payload the UI needs: latest point,
 * monthly change and the last `months` points. Returns null when the series has
 * fewer than 2 points (no change can be derived — callers fall back to the mock).
 */
export function buildQuotePayload(
  series: ArrobaQuote[],
  months = 12
): MarketQuotePayload | null {
  if (series.length < 2) return null;
  const current = series[series.length - 1];
  const previous = series[series.length - 2];
  const changePct =
    previous.value === 0 ? 0 : ((current.value - previous.value) / previous.value) * 100;
  return {
    current,
    changePct: Math.round(changePct * 10) / 10,
    series: series.slice(-months),
    source: IPEADATA_SOURCE_LABEL,
  };
}
