/**
 * GET /api/market/quote — real fat steer arroba quote for the UI.
 *
 * Two independent upstreams, merged by mergeQuotePayload (lib/data/market):
 * - CURRENT price: Scot Consultoria's public boi gordo page (praça MS
 *   C. Grande, daily R$/@ à vista — lib/data/scot.ts). Cached 6h (the page
 *   updates once a day at 18h).
 * - HISTORY: IPEADATA's open OData series (Seab/Deral-PR monthly average —
 *   lib/data/ipeadata.ts). Cached 24h (monthly series).
 *
 * Each upstream may fail independently; the stale cache of either side is
 * served when available. 502 only when neither side has anything — the client
 * then renders "—" (no mock fallback exists anymore).
 */
import {
  mergeQuotePayload,
  type ArrobaQuote,
  type SourcedSeries,
} from "@/lib/data/market";
import { SCOT_QUOTE_URL, SCOT_SOURCE_LABEL, parseScotMsQuote } from "@/lib/data/scot";
import {
  IPEADATA_SERIES_URL,
  IPEADATA_SOURCE_LABEL,
  parseIpeadataSeries,
} from "@/lib/data/ipeadata";

const SCOT_TTL_MS = 6 * 60 * 60 * 1000;
const IPEA_TTL_MS = 24 * 60 * 60 * 1000;

let scotCache: { quote: ArrobaQuote; fetchedAt: number } | null = null;
let ipeaCache: { series: ArrobaQuote[]; fetchedAt: number } | null = null;

/** Daily current price from Scot; serves the stale cache on failure. */
async function fetchScot(): Promise<ArrobaQuote | null> {
  if (scotCache && Date.now() - scotCache.fetchedAt < SCOT_TTL_MS) {
    return scotCache.quote;
  }
  try {
    const res = await fetch(SCOT_QUOTE_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: {
        // The page serves plain HTML but rejects requests without a browser UA.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    });
    if (!res.ok) throw new Error(`scot responded ${res.status}`);
    const quote = parseScotMsQuote(await res.text());
    if (!quote) throw new Error("scot page shape changed");
    scotCache = { quote, fetchedAt: Date.now() };
    return quote;
  } catch {
    return scotCache?.quote ?? null;
  }
}

/** Monthly history from IPEADATA; serves the stale cache on failure. */
async function fetchIpeadata(): Promise<ArrobaQuote[] | null> {
  if (ipeaCache && Date.now() - ipeaCache.fetchedAt < IPEA_TTL_MS) {
    return ipeaCache.series;
  }
  try {
    const res = await fetch(IPEADATA_SERIES_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`ipeadata responded ${res.status}`);
    const series = parseIpeadataSeries(await res.json());
    if (series.length === 0) throw new Error("ipeadata series empty");
    ipeaCache = { series, fetchedAt: Date.now() };
    return series;
  } catch {
    return ipeaCache?.series ?? null;
  }
}

export async function GET(): Promise<Response> {
  const [scotQuote, ipeaSeries] = await Promise.all([fetchScot(), fetchIpeadata()]);

  const history: SourcedSeries | null =
    ipeaSeries !== null ? { series: ipeaSeries, source: IPEADATA_SOURCE_LABEL } : null;
  const payload = mergeQuotePayload(
    scotQuote !== null ? { quote: scotQuote, source: SCOT_SOURCE_LABEL } : null,
    history
  );

  if (payload === null) {
    return Response.json({ error: "quote_unavailable" }, { status: 502 });
  }
  return Response.json(payload);
}
