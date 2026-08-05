/**
 * Parsing coordinates typed or pasted by hand — the path for a farm that
 * already has surveyed points, a handheld GPS, or a list sent by the agronomist,
 * and the honest answer when the satellite imagery is too old or too cloudy to
 * trace over.
 *
 * INPUT IS LATITUDE FIRST. That is what Google Maps, GPS handhelds and every
 * memorial print, and it is the reverse of the [lng, lat] the domain stores —
 * so the swap happens here, once, and what comes out is a domain Ring. In DMS
 * the hemisphere letters say which coordinate is which, so order stops
 * mattering and a reversed line still parses correctly.
 *
 * Accepts what Brazilian sources actually emit: dot decimals, comma decimals
 * ("-19,72, -47,91"), and DMS with Portuguese hemispheres — O for Oeste and L
 * for Leste alongside W and E.
 *
 * No React and no I/O: the dialog renders whatever this returns, and the server
 * re-validates the ring it receives.
 */
import { normalizeRing, type Ring } from "@/lib/domain/geo";

/** One line that could not be read, reported back with its position. */
export interface CoordinateLineError {
  /** 1-based line number as the farmer sees it in the textarea. */
  line: number;
  text: string;
  /** pt-BR explanation, shown as-is. */
  reason: string;
}

export interface ParsedCoordinates {
  /** Points that parsed, normalized and in stored [lng, lat] order. */
  ring: Ring;
  errors: CoordinateLineError[];
  /**
   * The paste is probably longitude-first. A warning and never a rejection —
   * see {@link looksReversed} for why this cannot be decided with certainty.
   */
  reversedSuspected: boolean;
}

/**
 * Rough bounding box of Brazil, used ONLY to flag a suspicious paste.
 * Deliberately generous.
 */
const BRAZIL_BOUNDS = { minLat: -34, maxLat: 6, minLng: -74, maxLng: -28 };

function insideBrazil(lat: number, lng: number): boolean {
  return (
    lat >= BRAZIL_BOUNDS.minLat &&
    lat <= BRAZIL_BOUNDS.maxLat &&
    lng >= BRAZIL_BOUNDS.minLng &&
    lng <= BRAZIL_BOUNDS.maxLng
  );
}

/**
 * True when a point lands outside Brazil but would land inside it with the two
 * coordinates swapped.
 *
 * Range validation cannot catch a reversed paste here: Brazil spans longitudes
 * -28..-74, and every one of those is also a valid latitude, so "-47.91, -19.72"
 * is a structurally perfect coordinate somewhere in the South Atlantic. Only
 * plausibility distinguishes them, so this warns and never blocks — a farm
 * genuinely outside the box must still be enterable.
 */
export function looksReversed(lat: number, lng: number): boolean {
  return !insideBrazil(lat, lng) && insideBrazil(lng, lat);
}

/**
 * A degrees/minutes/seconds coordinate with its hemisphere. Minutes and seconds
 * are optional, but each must carry its own mark so a bare number can never be
 * mistaken for them.
 */
const DMS_TOKEN =
  /(\d+(?:[.,]\d+)?)\s*[°º]\s*(?:(\d+(?:[.,]\d+)?)\s*['′’]\s*)?(?:(\d+(?:[.,]\d+)?)\s*["″”]\s*)?([NSEWOL])/gi;

/** Hemispheres that make a coordinate negative: Sul, West and Oeste. */
const NEGATIVE_HEMISPHERES = new Set(["S", "W", "O"]);
/** Hemispheres that mark a latitude rather than a longitude. */
const LATITUDE_HEMISPHERES = new Set(["N", "S"]);

function toNumber(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 0;
  return Number(raw.replace(",", "."));
}

/** Whole number, optionally signed — a fragment of a comma decimal. */
function isIntegerFragment(text: string): boolean {
  return /^[+-]?\d+$/.test(text);
}

interface Point {
  lat: number;
  lng: number;
}

/** Reads both coordinates of a line written in DMS, or null when it is not DMS. */
function parseDmsPair(text: string): Point | "ambiguous" | null {
  const matches = [...text.matchAll(DMS_TOKEN)];
  if (matches.length === 0) return null;
  if (matches.length !== 2) return "ambiguous";

  const values = matches.map((match) => {
    const [, degrees, minutes, seconds, rawHemisphere] = match;
    const hemisphere = rawHemisphere.toUpperCase();
    const magnitude =
      toNumber(degrees) + toNumber(minutes) / 60 + toNumber(seconds) / 3600;
    return {
      value: NEGATIVE_HEMISPHERES.has(hemisphere) ? -magnitude : magnitude,
      isLatitude: LATITUDE_HEMISPHERES.has(hemisphere),
    };
  });

  // The hemispheres identify the axes, so a longitude-first line still works.
  const latitude = values.find((v) => v.isLatitude);
  const longitude = values.find((v) => !v.isLatitude);
  if (!latitude || !longitude) return "ambiguous";
  return { lat: latitude.value, lng: longitude.value };
}

/** Reads a line of two plain numbers, latitude first. */
function parseDecimalPair(text: string): Point | null {
  const commaFields = text
    .split(",")
    .map((field) => field.trim())
    .filter((field) => field !== "");

  /*
   * Comma decimals: "-19,72, -47,91" splits into exactly four whole-number
   * fragments, which no dot-decimal line ever produces — so the two forms stay
   * distinguishable without asking the farmer which one they used.
   */
  if (commaFields.length === 4 && commaFields.every(isIntegerFragment)) {
    const lat = Number(`${commaFields[0]}.${commaFields[1]}`);
    const lng = Number(`${commaFields[2]}.${commaFields[3]}`);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  const fields = text.split(/[,;\s]+/).filter((field) => field !== "");
  if (fields.length !== 2) return null;
  const lat = Number(fields[0]);
  const lng = Number(fields[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * Parses one line into a point, or returns the pt-BR reason it could not be
 * read. Range is checked here because a typo in a hand-typed coordinate is far
 * more likely than in a traced one.
 */
export function parseCoordinateLine(text: string): Point | { reason: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { reason: "Linha vazia." };

  const dms = parseDmsPair(trimmed);
  if (dms === "ambiguous") {
    return {
      reason:
        "Em graus, informe as duas coordenadas com o hemisfério (ex.: 19°43'12\"S 47°54'36\"O).",
    };
  }

  const point = dms ?? parseDecimalPair(trimmed);
  if (point === null) {
    return {
      reason: "Informe latitude e longitude, nesta ordem (ex.: -19.72, -47.91).",
    };
  }
  if (Math.abs(point.lat) > 90) {
    return {
      reason: `Latitude ${point.lat} fora da faixa (-90 a 90). A latitude vem primeiro.`,
    };
  }
  if (Math.abs(point.lng) > 180) {
    return { reason: `Longitude ${point.lng} fora da faixa (-180 a 180).` };
  }
  return point;
}

/**
 * Parses a pasted list — one point per line — into a ring ready to store.
 *
 * Every readable line is kept and every unreadable one is reported, so the
 * farmer fixes typos in place instead of losing the whole paste to one bad
 * character. A repeated closing point is dropped by `normalizeRing`, since
 * exports routinely repeat the first vertex.
 */
export function parseCoordinateList(input: string): ParsedCoordinates {
  const points: Ring = [];
  const errors: CoordinateLineError[] = [];
  let reversed = 0;

  input.split(/\r?\n/).forEach((text, index) => {
    if (text.trim() === "") return;
    const parsed = parseCoordinateLine(text);
    if ("reason" in parsed) {
      errors.push({ line: index + 1, text: text.trim(), reason: parsed.reason });
      return;
    }
    if (looksReversed(parsed.lat, parsed.lng)) reversed += 1;
    // Stored order is [lng, lat]; typed order is latitude first.
    points.push([parsed.lng, parsed.lat]);
  });

  return {
    ring: normalizeRing(points),
    errors,
    // Every point reversed means the paste is; one stray point is a typo.
    reversedSuspected: points.length > 0 && reversed === points.length,
  };
}
