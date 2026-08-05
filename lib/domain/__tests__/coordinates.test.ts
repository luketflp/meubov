import { describe, expect, it } from "vitest";
import {
  looksReversed,
  parseCoordinateLine,
  parseCoordinateList,
} from "@/lib/domain/coordinates";
import { ringAreaHectares } from "@/lib/domain/geo";

/** Helper: the point of a line that is expected to parse. */
function point(text: string): { lat: number; lng: number } {
  const parsed = parseCoordinateLine(text);
  if ("reason" in parsed) throw new Error(`expected a point, got: ${parsed.reason}`);
  return parsed;
}

describe("parseCoordinateLine — decimal", () => {
  it("reads latitude first, the order every GPS and map prints", () => {
    expect(point("-19.72, -47.91")).toEqual({ lat: -19.72, lng: -47.91 });
  });

  it("accepts whitespace or semicolons instead of a comma", () => {
    expect(point("-19.72 -47.91")).toEqual({ lat: -19.72, lng: -47.91 });
    expect(point("-19.72; -47.91")).toEqual({ lat: -19.72, lng: -47.91 });
  });

  it("reads Brazilian comma decimals", () => {
    expect(point("-19,72, -47,91")).toEqual({ lat: -19.72, lng: -47.91 });
  });

  it("keeps both coordinates negative in the south-west", () => {
    const { lat, lng } = point("-19.72, -47.91");
    expect(lat).toBeLessThan(0);
    expect(lng).toBeLessThan(0);
  });

  it("rejects a latitude that is genuinely impossible", () => {
    const parsed = parseCoordinateLine("-95, -47.91");
    expect(parsed).toHaveProperty("reason");
    expect("reason" in parsed && parsed.reason).toContain("latitude vem primeiro");
  });

  it("cannot reject a reversed line — it is a valid coordinate", () => {
    // Documented limitation: -47.91 is a perfectly good latitude, so a
    // longitude-first paste is structurally indistinguishable from a real
    // point in the South Atlantic. Plausibility is the only signal available.
    expect(point("-47.91, -19.72")).toEqual({ lat: -47.91, lng: -19.72 });
    expect(looksReversed(-47.91, -19.72)).toBe(true);
    expect(looksReversed(-19.72, -47.91)).toBe(false);
  });

  it("rejects lines that are not a pair of numbers", () => {
    expect(parseCoordinateLine("-19.72")).toHaveProperty("reason");
    expect(parseCoordinateLine("abc, def")).toHaveProperty("reason");
    expect(parseCoordinateLine("")).toHaveProperty("reason");
  });
});

describe("parseCoordinateLine — DMS", () => {
  it("converts degrees, minutes and seconds", () => {
    // 19°43'12" = 19 + 43/60 + 12/3600 = 19.72
    const { lat, lng } = point("19°43'12\"S 47°54'36\"W");
    expect(lat).toBeCloseTo(-19.72, 6);
    expect(lng).toBeCloseTo(-47.91, 6);
  });

  it("accepts the Portuguese hemispheres O (Oeste) and L (Leste)", () => {
    expect(point("19°43'12\"S 47°54'36\"O").lng).toBeCloseTo(-47.91, 6);
    expect(point("19°43'12\"S 47°54'36\"L").lng).toBeCloseTo(47.91, 6);
  });

  it("makes S and W negative, N and E positive", () => {
    const { lat, lng } = point("19°43'12\"N 47°54'36\"E");
    expect(lat).toBeCloseTo(19.72, 6);
    expect(lng).toBeCloseTo(47.91, 6);
  });

  it("uses the hemispheres to fix a reversed line", () => {
    // Longitude written first: the letters still identify each axis.
    const { lat, lng } = point("47°54'36\"W 19°43'12\"S");
    expect(lat).toBeCloseTo(-19.72, 6);
    expect(lng).toBeCloseTo(-47.91, 6);
  });

  it("accepts omitted seconds and comma decimals inside DMS", () => {
    expect(point("19°43'S 47°54'W").lat).toBeCloseTo(-(19 + 43 / 60), 6);
    expect(point("19°43'12,5\"S 47°54'36\"W").lat).toBeCloseTo(
      -(19 + 43 / 60 + 12.5 / 3600),
      6
    );
  });

  it("rejects a line with only one hemisphere", () => {
    const parsed = parseCoordinateLine("19°43'12\"S 47.91");
    expect(parsed).toHaveProperty("reason");
  });

  it("rejects two coordinates on the same axis", () => {
    expect(parseCoordinateLine("19°43'12\"S 47°54'36\"N")).toHaveProperty("reason");
  });
});

describe("parseCoordinateList", () => {
  const SEED_RECTANGLE_TEXT = [
    "-19.72, -47.91",
    "-19.72, -47.90332",
    "-19.71459, -47.90332",
    "-19.71459, -47.91",
  ].join("\n");

  it("builds a stored [lng, lat] ring from a latitude-first paste", () => {
    const { ring, errors } = parseCoordinateList(SEED_RECTANGLE_TEXT);
    expect(errors).toEqual([]);
    expect(ring).toEqual([
      [-47.91, -19.72],
      [-47.90332, -19.72],
      [-47.90332, -19.71459],
      [-47.91, -19.71459],
    ]);
  });

  it("measures the pasted rectangle as the seed's 42 ha", () => {
    const { ring } = parseCoordinateList(SEED_RECTANGLE_TEXT);
    expect(ringAreaHectares(ring)).toBeCloseTo(42.0634, 3);
  });

  it("drops a repeated closing point, which exports routinely include", () => {
    const { ring } = parseCoordinateList(`${SEED_RECTANGLE_TEXT}\n-19.72, -47.91`);
    expect(ring).toHaveLength(4);
  });

  it("ignores blank lines", () => {
    const { ring, errors } = parseCoordinateList(`\n${SEED_RECTANGLE_TEXT}\n\n`);
    expect(errors).toEqual([]);
    expect(ring).toHaveLength(4);
  });

  it("keeps the good lines and reports the bad ones by line number", () => {
    const { ring, errors } = parseCoordinateList(
      ["-19.72, -47.91", "lixo", "-19.72, -47.90332", "-19.71459, -47.90332"].join("\n")
    );
    expect(ring).toHaveLength(3);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(2);
    expect(errors[0].text).toBe("lixo");
  });

  it("flags a paste where every point looks reversed", () => {
    const reversed = parseCoordinateList(
      ["-47.91, -19.72", "-47.90332, -19.72", "-47.90332, -19.71459"].join("\n")
    );
    expect(reversed.errors).toEqual([]);
    expect(reversed.reversedSuspected).toBe(true);
    expect(parseCoordinateList(SEED_RECTANGLE_TEXT).reversedSuspected).toBe(false);
  });

  it("does not flag a single odd point as a reversed paste", () => {
    const mostlyFine = parseCoordinateList(
      ["-19.72, -47.91", "-19.72, -47.90332", "-47.90332, -19.71459"].join("\n")
    );
    expect(mostlyFine.reversedSuspected).toBe(false);
  });

  it("reads a DMS paste into the same ring as its decimal equivalent", () => {
    const dms = parseCoordinateList(
      [
        "19°43'12\"S 47°54'36\"O",
        "19°43'12\"S 47°54'11.952\"O",
        "19°42'52.524\"S 47°54'11.952\"O",
      ].join("\n")
    );
    expect(dms.errors).toEqual([]);
    expect(dms.ring).toHaveLength(3);
    expect(dms.ring[0][0]).toBeCloseTo(-47.91, 5);
    expect(dms.ring[0][1]).toBeCloseTo(-19.72, 5);
  });
});
