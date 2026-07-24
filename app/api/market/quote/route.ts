/**
 * GET /api/market/quote — real fat steer arroba quote for the UI.
 *
 * Proxies Scot Consultoria's public boi gordo page (praça MS C. Grande, daily
 * R$/@ à vista — see lib/data/scot.ts) so the browser talks only to our origin.
 * The parsed payload is kept in a module-level cache for 6h: the page is
 * updated once a day (18h), so anything fresher is wasted traffic. On upstream
 * failure the stale cache is served when available; otherwise 502 and the
 * client falls back to the mock.
 */
import type { MarketQuotePayload } from "@/lib/data/market";
import { SCOT_QUOTE_URL, buildScotQuotePayload, parseScotMsQuote } from "@/lib/data/scot";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cached: { payload: MarketQuotePayload; fetchedAt: number } | null = null;

export async function GET(): Promise<Response> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return Response.json(cached.payload);
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

    cached = { payload: buildScotQuotePayload(quote), fetchedAt: Date.now() };
    return Response.json(cached.payload);
  } catch {
    if (cached) return Response.json(cached.payload);
    return Response.json({ error: "quote_unavailable" }, { status: 502 });
  }
}
