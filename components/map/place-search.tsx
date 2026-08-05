"use client";

/**
 * Address search above the map, so the farmer can find the farm by typing
 * ("Fazenda Boa Vista, Uberaba") instead of panning satellite tiles from the
 * fallback center by hand.
 *
 * Geocoding is Nominatim (OpenStreetMap) — free and keyless like the Esri
 * tiles, but rate-limited to ~1 request/second. The debounce below is not a
 * UX nicety: firing per keystroke would get the app blocked by the provider.
 * Results are biased to Brazil and pt-BR labels, matching the audience.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";

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

const SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 500;

async function searchPlaces(
  query: string,
  signal: AbortSignal
): Promise<PlaceHit[]> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "5",
    countrycodes: "br",
    "accept-language": "pt-BR",
  });
  const res = await fetch(`${SEARCH_URL}?${params.toString()}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Geocoder respondeu ${res.status}`);
  const rows = (await res.json()) as Array<{
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
    boundingbox?: [string, string, string, string];
  }>;
  return rows.map((row) => {
    const [south, north, west, east] = row.boundingbox ?? [];
    const bounds =
      south !== undefined
        ? ([
            [Number(south), Number(west)],
            [Number(north), Number(east)],
          ] as [[number, number], [number, number]])
        : null;
    return {
      id: row.place_id,
      name: row.display_name,
      lat: Number(row.lat),
      lng: Number(row.lon),
      bounds,
    };
  });
}

export function PlaceSearch({ onSelect }: { onSelect: (hit: PlaceHit) => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  /* Choosing a hit writes its name into the input; without this flag the
     effect below would treat that write as a new query and reopen the list
     over the map the user just flew to. */
  const skipNextSearch = useRef(false);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (value.trim().length < MIN_QUERY_LENGTH) {
      setHits([]);
      setOpen(false);
      setLoading(false);
      setFailed(false);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) return;
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const results = await searchPlaces(trimmed, controller.signal);
        setHits(results);
        setOpen(true);
        setFailed(false);
      } catch (error) {
        // An aborted request is the previous keystroke, not a failure.
        if ((error as Error).name !== "AbortError") {
          setHits([]);
          setOpen(true);
          setFailed(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  // Tapping the map (or anywhere outside) dismisses the result list.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function choose(hit: PlaceHit) {
    skipNextSearch.current = true;
    setQuery(hit.name);
    setOpen(false);
    setLoading(false);
    onSelect(hit);
  }

  function clear() {
    setQuery("");
    setHits([]);
    setOpen(false);
    setLoading(false);
    setFailed(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor="place-search" className="sr-only">
        Buscar endereço ou cidade
      </label>
      <div className="flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3">
        {loading ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-ink-soft" aria-hidden />
        ) : (
          <Search className="size-4 shrink-0 text-ink-soft" aria-hidden />
        )}
        <input
          id="place-search"
          type="search"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          onFocus={() => {
            if (hits.length > 0 || failed) setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            // Enter picks the top hit — the common "type city, confirm" path.
            if (event.key === "Enter" && open && hits.length > 0) choose(hits[0]);
          }}
          placeholder="Buscar endereço ou cidade…"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="place-search-results"
          className="min-h-11 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
        />
        {query ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Limpar busca"
            className="flex min-h-11 items-center text-ink-soft hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {open ? (
        <ul
          id="place-search-results"
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-hairline bg-surface shadow-md"
        >
          {failed ? (
            <li className="px-3 py-2.5 text-sm text-attention" role="status">
              Não foi possível buscar. Verifique a conexão.
            </li>
          ) : hits.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-ink-soft">
              Nenhum lugar encontrado.
            </li>
          ) : (
            hits.map((hit) => (
              <li key={hit.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => choose(hit)}
                  className="flex min-h-11 w-full items-start gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface-strong"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-ink-soft" aria-hidden />
                  {hit.name}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
