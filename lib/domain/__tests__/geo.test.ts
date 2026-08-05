import { describe, expect, it } from "vitest";
import area from "@turf/area";
import {
  COORD_DECIMALS,
  MIN_RING_VERTICES,
  closeRing,
  fromLatLngRing,
  isSelfIntersecting,
  isUsableRing,
  isValidRing,
  normalizeRing,
  ringAreaHectares,
  toLatLngRing,
  type Ring,
} from "@/lib/domain/geo";

/**
 * "Lote da Sede" from the demo seed (lib/data/seed.ts): an axis-aligned
 * rectangle north of Uberaba, declared as 42 ha. Both coordinates are negative
 * — Brazil is south and west — which is what makes it a useful sign fixture.
 */
const SEED_RECTANGLE: Ring = [
  [-47.91, -19.72],
  [-47.90332, -19.72],
  [-47.90332, -19.71459],
  [-47.91, -19.71459],
];

const TRIANGLE: Ring = [
  [-47.91, -19.72],
  [-47.9, -19.72],
  [-47.9, -19.71],
];

/** Vertices ordered so the outline crosses itself. */
const BOWTIE: Ring = [
  [-47.91, -19.72],
  [-47.9, -19.72],
  [-47.91, -19.71],
  [-47.9, -19.71],
];

describe("isValidRing", () => {
  it("accepts a ring of the demo seed", () => {
    expect(isValidRing(SEED_RECTANGLE)).toBe(true);
  });

  it("accepts the doubly negative coordinates of Brazil", () => {
    expect(SEED_RECTANGLE.every(([lng, lat]) => lng < 0 && lat < 0)).toBe(true);
    expect(isValidRing(SEED_RECTANGLE)).toBe(true);
  });

  it("rejects fewer vertices than enclose an area", () => {
    expect(MIN_RING_VERTICES).toBe(3);
    expect(isValidRing([])).toBe(false);
    expect(isValidRing([[-47.91, -19.72]])).toBe(false);
    expect(
      isValidRing([
        [-47.91, -19.72],
        [-47.9, -19.72],
      ])
    ).toBe(false);
  });

  it("rejects non-finite coordinates", () => {
    expect(isValidRing([[Number.NaN, -19.72], ...TRIANGLE])).toBe(false);
    expect(isValidRing([[Number.POSITIVE_INFINITY, -19.72], ...TRIANGLE])).toBe(false);
  });

  it("rejects coordinates outside the valid ranges", () => {
    expect(isValidRing([[-47.91, -95], ...TRIANGLE])).toBe(false);
    expect(isValidRing([[-190, -19.72], ...TRIANGLE])).toBe(false);
  });

  it("does NOT catch swapped axes at Brazilian coordinates", () => {
    // Documented limitation, not an oversight. Brazil spans longitudes -34..-74
    // and every one of those is also a valid latitude, so [lat, lng] passes
    // every range check and yields a plausible polygon in the South Atlantic.
    // Axis order is guaranteed by funnelling the swap through toLatLngRing /
    // fromLatLngRing, never by validating it here.
    const swapped = SEED_RECTANGLE.map(([lng, lat]): [number, number] => [lat, lng]);
    expect(isValidRing(swapped)).toBe(true);
    expect(fromLatLngRing(toLatLngRing(SEED_RECTANGLE))).toEqual(SEED_RECTANGLE);
  });

  it("rejects values that are not coordinate pairs", () => {
    expect(isValidRing("not a ring")).toBe(false);
    expect(isValidRing([1, 2, 3])).toBe(false);
    expect(isValidRing([[-47.91], [-47.9, -19.72], [-47.9, -19.71]])).toBe(false);
  });
});

describe("normalizeRing", () => {
  it("drops the repeated first vertex a drawing tool appends", () => {
    expect(normalizeRing(closeRing(SEED_RECTANGLE))).toEqual(SEED_RECTANGLE);
  });

  it("collapses consecutive duplicates", () => {
    const withDuplicate: Ring = [SEED_RECTANGLE[0], ...SEED_RECTANGLE];
    expect(normalizeRing(withDuplicate)).toEqual(SEED_RECTANGLE);
  });

  it("rounds coordinates to the stored precision", () => {
    expect(COORD_DECIMALS).toBe(6);
    const noisy: Ring = [[-47.9123456789, -19.7212345678], ...TRIANGLE.slice(1)];
    expect(normalizeRing(noisy)[0]).toEqual([-47.912346, -19.721235]);
  });

  it("is idempotent", () => {
    const once = normalizeRing(SEED_RECTANGLE);
    expect(normalizeRing(once)).toEqual(once);
  });

  it("leaves an already canonical ring untouched", () => {
    expect(normalizeRing(SEED_RECTANGLE)).toEqual(SEED_RECTANGLE);
  });
});

describe("ringAreaHectares", () => {
  it("measures the seed rectangle close to its declared 42 ha", () => {
    expect(ringAreaHectares(SEED_RECTANGLE)).toBeCloseTo(42.0634, 3);
  });

  it("closes the ring itself — the open ring is not measured as half", () => {
    // Regression guard: @turf/area assumes a closed ring and drops the last
    // vertex, so feeding it our open ring silently measures a triangle.
    const rawOpenIntoTurf =
      area({ type: "Polygon", coordinates: [SEED_RECTANGLE] }) / 10_000;
    expect(rawOpenIntoTurf).toBeCloseTo(21.0317, 3);
    expect(ringAreaHectares(SEED_RECTANGLE)).toBeCloseTo(2 * rawOpenIntoTurf, 3);
  });

  it("does not report an open triangle as zero", () => {
    // The same trap at its worst: a 3-vertex ring loses a third of itself and
    // turf returns 0 without throwing.
    expect(area({ type: "Polygon", coordinates: [TRIANGLE] })).toBe(0);
    expect(ringAreaHectares(TRIANGLE)).toBeCloseTo(58.1979, 3);
  });

  it("gives the same area whether the input ring is open or already closed", () => {
    expect(ringAreaHectares(closeRing(SEED_RECTANGLE))).toBeCloseTo(
      ringAreaHectares(SEED_RECTANGLE),
      6
    );
  });

  it("returns 0 for an invalid ring instead of throwing or inventing a number", () => {
    // An empty ring used to become [undefined] on closing, which turf happily
    // measured as 0 — an invisible invernada labelled "0,0 ha".
    expect(ringAreaHectares([])).toBe(0);
    expect(ringAreaHectares([[-47.91, -19.72]])).toBe(0);
  });
});

describe("toLatLngRing / fromLatLngRing", () => {
  it("swaps into Leaflet's axis order", () => {
    expect(toLatLngRing(SEED_RECTANGLE)[0]).toEqual([-19.72, -47.91]);
  });

  it("keeps the farm in the southern and western hemispheres", () => {
    for (const [lat, lng] of toLatLngRing(SEED_RECTANGLE)) {
      expect(lat).toBeGreaterThan(-20);
      expect(lat).toBeLessThan(-19);
      expect(lng).toBeLessThan(-47);
      expect(lng).toBeGreaterThan(-48);
    }
  });

  it("round-trips", () => {
    expect(fromLatLngRing(toLatLngRing(SEED_RECTANGLE))).toEqual(SEED_RECTANGLE);
  });
});

describe("isSelfIntersecting", () => {
  it("flags a bowtie, which turf would measure as zero", () => {
    expect(isSelfIntersecting(BOWTIE)).toBe(true);
    expect(ringAreaHectares(BOWTIE)).toBe(0);
  });

  it("accepts a convex outline", () => {
    expect(isSelfIntersecting(SEED_RECTANGLE)).toBe(false);
    expect(isSelfIntersecting(TRIANGLE)).toBe(false);
  });

  it("accepts a concave outline — an L-shaped invernada is legitimate", () => {
    const lShape: Ring = [
      [-47.91, -19.72],
      [-47.9, -19.72],
      [-47.9, -19.715],
      [-47.905, -19.715],
      [-47.905, -19.71],
      [-47.91, -19.71],
    ];
    expect(isSelfIntersecting(lShape)).toBe(false);
  });
});

describe("isUsableRing", () => {
  it("accepts a real pasture outline", () => {
    expect(isUsableRing(SEED_RECTANGLE)).toBe(true);
  });

  it("rejects three distinct but collinear points", () => {
    expect(
      isUsableRing([
        [-47.91, -19.72],
        [-47.9, -19.72],
        [-47.89, -19.72],
      ])
    ).toBe(false);
  });

  it("rejects a self-crossing outline", () => {
    expect(isUsableRing(BOWTIE)).toBe(false);
  });

  it("rejects a fence that returns through a non-consecutive vertex", () => {
    expect(
      isUsableRing([
        [-48, -20],
        [-47.99, -20],
        [-47.99, -19.99],
        [-47.99, -20],
        [-48, -19.99],
      ])
    ).toBe(false);
  });
});
