"use client";

/**
 * Client hook that delivers the arroba quote to the screens: tries the real
 * source (/api/market/quote → Scot Consultoria, boi gordo MS) and, while
 * loading or on failure, falls back to the illustrative mockMarket so the UI
 * always has a price. The `live` flag lets screens label the value ("cotação
 * de 31/07/2026 · Scot Consultoria" vs "ilustrativo"); `seriesLive` does the
 * same for the chart, since the daily source has no public history.
 */
import { useEffect, useState } from "react";
import {
  mockMarket,
  type ArrobaQuote,
  type MarketQuotePayload,
} from "@/lib/data/market";
import { formatDate } from "@/lib/domain/dates";

export interface ArrobaQuoteView {
  /** Current price (R$/@) — live when available, mock otherwise. */
  price: number;
  /** Change (%) vs the previous point, or null when the source has no history. */
  changePct: number | null;
  /** Series for charts, ascending — the mock when the source has no history. */
  series: ArrobaQuote[];
  /** True when `series` comes from the real source (false = illustrative). */
  seriesLive: boolean;
  /** True when the price comes from the real source. */
  live: boolean;
  /** User-visible provenance, e.g. "cotação de 31/07/2026 · … Scot Consultoria". */
  sourceLabel: string | null;
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

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/market/quote", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isQuotePayload(data)) setPayload(data);
      })
      .catch(() => {
        // Fallback to the mock is the deliberate behavior — nothing to handle.
      });
    return () => controller.abort();
  }, []);

  if (payload === null) {
    return {
      price: mockMarket.currentArrobaPrice,
      changePct: mockMarket.monthlyChangePct,
      series: mockMarket.quoteSeries,
      seriesLive: false,
      live: false,
      sourceLabel: null,
    };
  }

  const seriesLive = payload.series.length > 0;
  return {
    price: payload.current.value,
    changePct: payload.changePct,
    series: seriesLive ? payload.series : mockMarket.quoteSeries,
    seriesLive,
    live: true,
    sourceLabel: `cotação de ${formatDate(payload.current.date)} · ${payload.source}`,
  };
}
