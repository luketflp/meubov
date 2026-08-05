/**
 * Pasture geometry — pure functions over the outline of a lot.
 *
 * A ring is OPEN and in GeoJSON axis order: `[lng, lat]` pairs, the first point
 * NOT repeated at the end. That is the contract of `Lot.boundary` and of the
 * `lots.boundary` jsonb column, and every conversion in and out of it belongs
 * here — Leaflet speaks `[lat, lng]`, and the inversion silently produces a
 * plausible polygon in the wrong hemisphere when it is done by hand.
 *
 * Node-safe on purpose: nothing here may import `leaflet` or `react-leaflet`,
 * so the API services and Vitest can use it.
 */
import area from "@turf/area";

/** Open ring of [lng, lat] pairs; the first point is not repeated. */
export type Ring = [number, number][];

/** Fewest vertices that enclose an area. */
export const MIN_RING_VERTICES = 3;

/**
 * Decimals kept per coordinate. At Brazil's latitudes the 6th decimal is
 * ~0.11 m — far below GPS and hand-drawing accuracy, so anything beyond it is
 * noise that only inflates the stored jsonb.
 */
export const COORD_DECIMALS = 6;

const MAX_LNG = 180;
const MAX_LAT = 90;
const SQUARE_METERS_PER_HECTARE = 10_000;

function isFinitePair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

/**
 * True when `value` is a usable outline: at least {@link MIN_RING_VERTICES}
 * finite [lng, lat] pairs inside the valid coordinate ranges.
 *
 * Deliberately NOT a defence against swapped axes. Brazil spans longitudes
 * -34..-74, every one of which is also a valid latitude, so a ring built as
 * [lat, lng] passes this check and lands in the South Atlantic as a perfectly
 * plausible polygon. Axis order is guaranteed structurally instead: the swap
 * happens only in {@link toLatLngRing} / {@link fromLatLngRing}, so no caller
 * has to remember which order it holds.
 */
export function isValidRing(value: unknown): value is Ring {
  if (!Array.isArray(value) || value.length < MIN_RING_VERTICES) return false;
  return value.every(
    (point) =>
      isFinitePair(point) &&
      Math.abs(point[0]) <= MAX_LNG &&
      Math.abs(point[1]) <= MAX_LAT
  );
}

function round(value: number): number {
  const factor = 10 ** COORD_DECIMALS;
  return Math.round(value * factor) / factor;
}

/**
 * Canonical form of a ring as it should be stored: coordinates rounded to
 * {@link COORD_DECIMALS}, consecutive duplicates collapsed, and the closing
 * point dropped when the drawing tool repeated the first vertex.
 *
 * Idempotent — normalizing an already-normalized ring returns an equal ring.
 */
export function normalizeRing(ring: Ring): Ring {
  const rounded: Ring = ring.map(([lng, lat]) => [round(lng), round(lat)]);

  const deduped: Ring = [];
  for (const point of rounded) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous[0] === point[0] && previous[1] === point[1]) continue;
    deduped.push(point);
  }

  // A repeated first vertex is how GeoJSON closes a ring; ours stays open.
  const first = deduped[0];
  const last = deduped[deduped.length - 1];
  if (deduped.length > 1 && first[0] === last[0] && first[1] === last[1]) {
    deduped.pop();
  }
  return deduped;
}

/** The ring with its first vertex repeated at the end (GeoJSON closure). */
export function closeRing(ring: Ring): Ring {
  return [...ring, ring[0]];
}

/**
 * Measured area of the outline, in hectares.
 *
 * The ONE place a ring gets closed. `@turf/area` assumes a closed ring and
 * drops the last vertex, so handing it our open ring measures the wrong
 * polygon — a rectangle reads half its area and a triangle reads zero, both
 * without throwing. Invalid rings return 0 rather than a fabricated number.
 *
 * Known bias: turf integrates on a sphere of mean radius, which overstates
 * area by ~0.3% at Uberaba's latitude. Cosmetic at the scale of a lot; an
 * ellipsoidal correction is the fix if that ever stops being true.
 */
export function ringAreaHectares(ring: Ring): number {
  if (!isValidRing(ring)) return 0;
  const geometry = { type: "Polygon" as const, coordinates: [closeRing(ring)] };
  return area(geometry) / SQUARE_METERS_PER_HECTARE;
}

/** [lng, lat] ring → Leaflet's [lat, lng] positions. */
export function toLatLngRing(ring: Ring): [number, number][] {
  return ring.map(([lng, lat]) => [lat, lng]);
}

/** Leaflet's [lat, lng] positions → a [lng, lat] ring. */
export function fromLatLngRing(positions: [number, number][]): Ring {
  return positions.map(([lat, lng]) => [lng, lat]);
}

/** True when segments ab and cd cross, endpoints excluded. */
function segmentsCross(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number]
): boolean {
  const cross = (
    p: [number, number],
    q: [number, number],
    r: [number, number]
  ): number => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);

  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  // Strict signs only: touching endpoints are how a ring's segments connect.
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * True when the outline crosses itself (a "bowtie"). Such a ring is not a
 * pasture: `@turf/area` measures its lobes against each other and can report
 * zero, so it must be rejected on the way in rather than displayed.
 *
 * O(n²) — fine for a hand-drawn lot, which is dozens of points, not
 * thousands. Imported outlines must be simplified before they reach here.
 */
export function isSelfIntersecting(ring: Ring): boolean {
  const closed = closeRing(ring);
  const segments = closed.length - 1;
  for (let i = 0; i < segments; i++) {
    // Skip the neighbour (shares a vertex) and, for i = 0, the closing segment.
    const last = i === 0 ? segments - 1 : segments;
    for (let j = i + 2; j < last; j++) {
      if (segmentsCross(closed[i], closed[i + 1], closed[j], closed[j + 1])) {
        return true;
      }
    }
  }
  return false;
}
