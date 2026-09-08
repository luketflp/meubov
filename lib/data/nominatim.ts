/**
 * Geocoding upstream: Nominatim (OpenStreetMap) — free and keyless, like the
 * Esri satellite tiles the map draws.
 *
 * The browser must NOT call Nominatim directly. Their usage policy requires a
 * User-Agent that identifies the application (a browser refuses to set one)
 * and caps traffic at ~1 request/second per source, so a public deployment
 * gets 403/429 where a single developer on localhost slides under the limit.
 * The HTTP boundary is `app/api/geocode/route.ts`, which adds the User-Agent,
 * caches results and serialises the calls; this module is pure fetch-shape +
 * parsing (server-safe, unit-testable).
 */

export const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";

/** Identifies MeuBov to Nominatim, as their usage policy demands. */
export const NOMINATIM_USER_AGENT =
  "MeuBov/1.0 (+https://github.com/luketflp/meubov)";

/** Shortest query worth geocoding — below it every result is noise. */
export const MIN_QUERY_LENGTH = 3;

export type PlaceHit = {
  id: number;
  /** Full display name from the geocoder ("Uberaba, Minas Gerais, Brasil"). */
  name: string;
  lat: number;
  lng: number;
  /** [[south, west], [north, east]] when the place has an extent (a city does,
      a single address does not always). */
  bounds: [[number, number], [number, number]] | null;
};

/** Results are biased to Brazil and pt-BR labels, matching the audience. */
export function nominatimSearchUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "5",
    countrycodes: "br",
    "accept-language": "pt-BR",
  });
  return `${NOMINATIM_SEARCH_URL}?${params.toString()}`;
}

/**
 * Collapses whitespace and case so "  Uberaba  MG " and "uberaba mg" share one
 * cache entry — the same place typed twice must not cost two upstream calls.
 */
export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Parses the jsonv2 response into PlaceHit[]. Tolerant to the API's shape:
 * rows without usable coordinates are dropped rather than surfaced as NaN.
 */
export function parseNominatimPlaces(payload: unknown): PlaceHit[] {
  if (!Array.isArray(payload)) return [];

  const places: PlaceHit[] = [];
  for (const row of payload) {
    if (typeof row !== "object" || row === null) continue;
    const { place_id, display_name, lat, lon, boundingbox } = row as {
      place_id?: unknown;
      display_name?: unknown;
      lat?: unknown;
      lon?: unknown;
      boundingbox?: unknown;
    };
    if (typeof place_id !== "number" || typeof display_name !== "string") continue;
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    places.push({
      id: place_id,
      name: display_name,
      lat: latitude,
      lng: longitude,
      bounds: parseBoundingBox(boundingbox),
    });
  }
  return places;
}

/** Nominatim sends [south, north, west, east] as strings, or nothing at all. */
function parseBoundingBox(
  boundingbox: unknown
): [[number, number], [number, number]] | null {
  if (!Array.isArray(boundingbox) || boundingbox.length < 4) return null;
  const [south, north, west, east] = boundingbox.map(Number);
  if (![south, north, west, east].every(Number.isFinite)) return null;
  return [
    [south, west],
    [north, east],
  ];
}
