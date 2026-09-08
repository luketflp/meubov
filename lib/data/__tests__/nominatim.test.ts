import { describe, expect, it } from "vitest";
import {
  nominatimSearchUrl,
  normalizeQuery,
  parseNominatimPlaces,
} from "@/lib/data/nominatim";

const uberaba = {
  place_id: 123,
  display_name: "Uberaba, Minas Gerais, Brasil",
  lat: "-19.7472",
  lon: "-47.9381",
  boundingbox: ["-19.9", "-19.5", "-48.2", "-47.7"],
};

describe("parseNominatimPlaces", () => {
  it("maps a row to a hit with [[south, west], [north, east]] bounds", () => {
    expect(parseNominatimPlaces([uberaba])).toEqual([
      {
        id: 123,
        name: "Uberaba, Minas Gerais, Brasil",
        lat: -19.7472,
        lng: -47.9381,
        bounds: [
          [-19.9, -48.2],
          [-19.5, -47.7],
        ],
      },
    ]);
  });

  it("keeps a place without an extent, with null bounds", () => {
    const { boundingbox, ...address } = uberaba;
    void boundingbox;
    expect(parseNominatimPlaces([address])[0].bounds).toBeNull();
  });

  it("drops unusable rows and tolerates junk shapes", () => {
    const places = parseNominatimPlaces([
      uberaba,
      { ...uberaba, place_id: 9, lat: "n/a" },
      { ...uberaba, place_id: 10, display_name: 42 },
      7,
      null,
      {},
    ]);
    expect(places.map((place) => place.id)).toEqual([123]);
    expect(parseNominatimPlaces(null)).toEqual([]);
    expect(parseNominatimPlaces({ error: "blocked" })).toEqual([]);
    expect(parseNominatimPlaces("html error page")).toEqual([]);
  });
});

describe("normalizeQuery", () => {
  it("collapses case and whitespace so one place is one cache entry", () => {
    expect(normalizeQuery("  Uberaba   MG ")).toBe("uberaba mg");
  });
});

describe("nominatimSearchUrl", () => {
  it("biases the search to Brazil and pt-BR labels", () => {
    const url = new URL(nominatimSearchUrl("fazenda boa vista"));
    expect(url.origin + url.pathname).toBe(
      "https://nominatim.openstreetmap.org/search"
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "fazenda boa vista",
      format: "jsonv2",
      limit: "5",
      countrycodes: "br",
      "accept-language": "pt-BR",
    });
  });
});
