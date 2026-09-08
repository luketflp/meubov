/**
 * GET /api/geocode?q=... — address/city search for the map, proxied.
 *
 * The map used to call Nominatim straight from the browser, which works on
 * localhost and fails in production: their usage policy needs a User-Agent
 * naming the app (the browser will not send one) and allows ~1 request per
 * second per source, so real traffic earns a 403/429. Going through the server
 * fixes all of it — and, being same-origin, it is also immune to CORS, CSP and
 * ad blockers.
 *
 * Session required: an open proxy would let anyone burn MeuBov's Nominatim
 * quota and get the server's IP blocked for every farmer.
 */
import { auth } from "@/lib/auth";
import {
  MIN_QUERY_LENGTH,
  NOMINATIM_USER_AGENT,
  nominatimSearchUrl,
  normalizeQuery,
  parseNominatimPlaces,
  type PlaceHit,
} from "@/lib/data/nominatim";

/** Places do not move; a day of cache costs nothing and saves the quota. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Bounded so a long-lived instance cannot grow the map without limit. */
const CACHE_MAX_ENTRIES = 200;
/** Nominatim allows ~1 req/s; the extra 100ms absorbs clock jitter. */
const MIN_INTERVAL_MS = 1_100;
const UPSTREAM_TIMEOUT_MS = 10_000;
/** Long queries are pasted junk, not addresses — refuse before the network. */
const MAX_QUERY_LENGTH = 120;

const cache = new Map<string, { places: PlaceHit[]; fetchedAt: number }>();

function readCache(key: string): PlaceHit[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.places;
}

function writeCache(key: string, places: PlaceHit[]): void {
  // Map iterates in insertion order, so the first key is the oldest one.
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { places, fetchedAt: Date.now() });
}

let lastCallAt = 0;
let chain: Promise<unknown> = Promise.resolve();

/**
 * Runs upstream calls one at a time, at most one per MIN_INTERVAL_MS. Two
 * farmers typing at once would otherwise fire concurrent requests and trip the
 * rate limit that this whole route exists to respect.
 */
function schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      return await task();
    } finally {
      lastCallAt = Date.now();
    }
  });
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function geocode(query: string): Promise<PlaceHit[]> {
  const res = await fetch(nominatimSearchUrl(query), {
    cache: "no-store",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      "User-Agent": NOMINATIM_USER_AGENT,
    },
  });
  if (!res.ok) throw new Error(`nominatim responded ${res.status}`);
  return parseNominatimPlaces(await res.json());
}

export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const raw = new URL(request.url).searchParams.get("q") ?? "";
  const query = normalizeQuery(raw);
  if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
    return Response.json({ error: "invalid_query" }, { status: 400 });
  }

  const cached = readCache(query);
  if (cached) return jsonPlaces(cached);

  try {
    const places = await schedule(async () => {
      // The queue may have been long enough for a twin request to fill the
      // cache while this one waited its turn.
      const filled = readCache(query);
      if (filled) return filled;
      const fresh = await geocode(query);
      writeCache(query, fresh);
      return fresh;
    });
    return jsonPlaces(places);
  } catch {
    return Response.json({ error: "geocoder_unavailable" }, { status: 502 });
  }
}

/** Private: results are served behind a session, so no shared cache may keep them. */
function jsonPlaces(places: PlaceHit[]): Response {
  return Response.json(
    { places },
    { headers: { "Cache-Control": "private, max-age=86400" } }
  );
}
