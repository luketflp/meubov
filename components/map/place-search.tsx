"use client";

/**
 * Address search above the map, so the farmer can find the farm by typing
 * ("Fazenda Boa Vista, Uberaba") instead of panning satellite tiles from the
 * fallback center by hand.
 *
 * Geocoding goes through /api/geocode, never straight to Nominatim from the
 * browser: the proxy is what identifies the app and honours the provider's
 * ~1 request/second cap (app/api/geocode/route.ts). The debounce below is not
 * a UX nicety either — firing per keystroke would queue behind that cap and
 * land every result seconds late.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { MIN_QUERY_LENGTH, type PlaceHit } from "@/lib/data/nominatim";

export type { PlaceHit };

const DEBOUNCE_MS = 500;

async function searchPlaces(
  query: string,
  signal: AbortSignal
): Promise<PlaceHit[]> {
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Geocoder respondeu ${res.status}`);
  const payload = (await res.json()) as { places?: PlaceHit[] };
  return payload.places ?? [];
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
