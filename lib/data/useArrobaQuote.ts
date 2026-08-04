"use client";

/**
 * Client hook that delivers the arroba quote to the screens from
 * /api/market/quote (Scot Consultoria current price + IPEADATA monthly
 * history). There is NO fallback value: when the API fails, `price` is null
 * and every @-dependent figure renders "—" — the app never shows a fake
 * number.
 */
import { useEffect, useState } from "react";
import type { ArrobaQuote, MarketQuotePayload } from "@/lib/data/market";
import { formatDate } from "@/lib/domain/dates";

export interface ArrobaQuoteView {
  /** Current price (R$/@), or null while loading / when unavailable. */
  price: number | null;
  /** Change (%) vs the previous month, or null when there is no history. */
  changePct: number | null;
  /** Historical series for charts, ascending (empty when unavailable). */
  series: ArrobaQuote[];
  /** True while the first fetch is in flight. */
  loading: boolean;
  /** True when the payload came from the real source. */
  live: boolean;
  /** Provenance of the price, e.g. "cotação de 31/07/2026 · … Scot Consultoria". */
  sourceLabel: string | null;
  /** Provenance of the series (history source), or null without series. */
  seriesSourceLabel: string | null;
}

/** Narrow unknown JSON into the payload shape (defensive on the boundary). */
function isQuotePayload(data: unknown): data is MarketQuotePayload {
  if (typeof data !== "object" || data === null) return false;
  const p = data as Partial<MarketQuotePayload>;
  return (
    typeof p.current?.value === "number" &&
    typeof p.current?.date === "string" &&
    (typeof p.changePct === "number" || p.changePct === null) &&
    Array.isArray(p.series)
  );
}

export function useArrobaQuote(): ArrobaQuoteView {
  const [payload, setPayload] = useState<MarketQuotePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/market/quote", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isQuotePayload(data)) setPayload(data);
        setLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  if (payload === null) {
    return {
      price: null,
      changePct: null,
      series: [],
      loading,
      live: false,
      sourceLabel: null,
      seriesSourceLabel: null,
    };
  }

  return {
    price: payload.current.value,
    changePct: payload.changePct,
    series: payload.series,
    loading: false,
    live: true,
    sourceLabel: `cotação de ${formatDate(payload.current.date)} · ${payload.source}`,
    seriesSourceLabel: payload.seriesSource,
  };
}
