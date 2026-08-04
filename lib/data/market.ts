/**
 * Arroba quote contracts and the merge of the two REAL sources:
 * - Scot Consultoria (lib/data/scot.ts): daily current price, no history.
 * - IPEADATA (lib/data/ipeadata.ts): monthly historical series.
 * The HTTP boundary lives in app/api/market/quote/route.ts; the client hook
 * is lib/data/useArrobaQuote.ts. There is no mock data here.
 */

/** Fat steer arroba quote point (R$/@) on an ISO date. */
export interface ArrobaQuote {
  date: string;
  value: number;
}

/** Payload served by /api/market/quote and consumed by the UI. */
export interface MarketQuotePayload {
  /** Latest quote of the source. */
  current: ArrobaQuote;
  /** Change vs the previous point in %, or null when the source has no history. */
  changePct: number | null;
  /** Historical points, ascending (may be empty for snapshot-only sources). */
  series: ArrobaQuote[];
  /** User-visible source label of the current price. */
  source: string;
  /** User-visible source label of the series, null when there is no series. */
  seriesSource: string | null;
}

/** A quote paired with its user-visible source label. */
export interface SourcedQuote {
  quote: ArrobaQuote;
  source: string;
}

/** A historical series paired with its user-visible source label. */
export interface SourcedSeries {
  series: ArrobaQuote[];
  source: string;
}

/**
 * Merges the daily current price (Scot) with the monthly history (IPEADATA)
 * into the single payload the UI consumes. Either side may be missing:
 * - No current price → the last history point stands in for it.
 * - No history → snapshot-only payload (empty series, null changePct).
 * - Neither → null (the route answers 502).
 * changePct compares the current price with the last history point of a month
 * STRICTLY before the current point's month (never the point itself).
 */
export function mergeQuotePayload(
  current: SourcedQuote | null,
  history: SourcedSeries | null,
  months = 12
): MarketQuotePayload | null {
  const series = history !== null ? history.series.slice(-months) : [];
  const effectiveCurrent =
    current ??
    (series.length > 0
      ? { quote: series[series.length - 1], source: history!.source }
      : null);
  if (effectiveCurrent === null) return null;

  const currentMonth = effectiveCurrent.quote.date.slice(0, 7);
  const previous = [...series]
    .reverse()
    .find((point) => point.date.slice(0, 7) < currentMonth);
  const changePct =
    previous === undefined || previous.value === 0
      ? null
      : Math.round(
          ((effectiveCurrent.quote.value - previous.value) / previous.value) * 1000
        ) / 10;

  return {
    current: effectiveCurrent.quote,
    changePct,
    series,
    source: effectiveCurrent.source,
    seriesSource: series.length > 0 ? history!.source : null,
  };
}
