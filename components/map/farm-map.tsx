"use client";

/**
 * Farm satellite map: Esri World Imagery tiles with one translucent polygon per
 * invernada, colored by the combined stocking-rate classification of the lots
 * currently placed there — the same semantics as the
 * StatusPill (alta/boa/folgada), so color = state. Tapping a polygon opens the
 * summary panel with the physical area's numbers and its occupying lots.
 *
 * Also the drawing surface: this component owns the draw state machine and
 * delegates to MapToolbar (controls), DrawLayer (the trace in progress) and
 * SaveBoundaryDialog (assigning a closed ring to an invernada). Nothing is persisted
 * until the farmer confirms.
 *
 * Client-only: Leaflet touches `window`, so the page imports this component
 * with `next/dynamic` and `ssr: false`.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import {
  latLngBounds,
  type LatLngBounds,
  type LatLngExpression,
  type Map as LeafletMap,
} from "leaflet";
import "leaflet/dist/leaflet.css";
import { Fence } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import {
  invernadasWithSummary,
  type InvernadaWithSummary,
} from "@/lib/store/selectors";
import type { Invernada, StockingRateClass } from "@/lib/types";
import {
  isUsableRing,
  normalizeRing,
  ringAreaHectares,
  toLatLngRing,
  type Ring,
} from "@/lib/domain/geo";
import { CoordinatesDialog } from "@/components/map/coordinates-dialog";
import { DrawLayer } from "@/components/map/draw-layer";
import { MapToolbar } from "@/components/map/map-toolbar";
import { PlaceSearch, type PlaceHit } from "@/components/map/place-search";
import { SaveBoundaryDialog } from "@/components/map/save-boundary-dialog";
import { formatArroba, formatKg, formatNumber } from "@/lib/domain/format";
import { kgToArroba } from "@/lib/domain/weights";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";

/** Esri World Imagery — free satellite tiles with attribution, no API key. */
const TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const TILE_ATTRIBUTION =
  "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics";

/** Fallback center (Uberaba-MG countryside) when nothing is drawn yet. */
const FALLBACK_CENTER: LatLngExpression = [-19.75, -47.93];

/** Polygon color per stocking class — same tones as the StatusPill. */
const CLASSIFICATION_COLOR: Record<StockingRateClass, string> = {
  high: "#9a3324",
  good: "#2f6b41",
  light: "#3f6379",
};

const CLASSIFICATION_LABEL: Record<StockingRateClass, string> = {
  high: "Lotação alta",
  good: "Lotação boa",
  light: "Folgada",
};

interface PendingBoundary {
  ring: Ring;
  /** Target selected when the trace/coordinate flow began. */
  initialTargetId?: string;
  /** A drawn target offered only for deliberate coordinate replacement. */
  replaceTargetId?: string;
}

function invernadaLabel(invernada: Pick<Invernada, "code" | "name">): string {
  return invernada.name
    ? `Invernada ${invernada.code} · ${invernada.name}`
    : `Invernada ${invernada.code}`;
}

function InvernadaPanel({ summary }: { summary: InvernadaWithSummary }) {
  const { invernada, lots, headCount, totalWeightKg, auPerHa, classification } = summary;
  const lotNames = lots.map((lot) => lot.name).join(", ");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-base font-semibold text-ink">
          {invernadaLabel(invernada)}
        </h3>
        <StatusPill status={classification} withDot />
      </div>
      <dl className="grid gap-1.5 text-sm sm:grid-cols-2">
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <dt className="text-ink-soft">Capim</dt>
          <dd className="text-ink">{invernada.grass}</dd>
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <dt className="text-ink-soft">Área</dt>
          <dd className="font-mono text-ink">
            {formatNumber(invernada.hectares)} ha
            {invernada.boundary ? (
              <span className="text-xs text-ink-soft">
                {" "}
                · {formatNumber(ringAreaHectares(invernada.boundary), 1)} ha no mapa
              </span>
            ) : null}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-2 sm:col-span-2 sm:justify-start">
          <dt className="shrink-0 text-ink-soft">Lotes atuais</dt>
          <dd className="text-right text-ink sm:text-left">
            {lotNames === "" ? "Nenhum lote nesta invernada" : lotNames}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <dt className="text-ink-soft">Cabeças</dt>
          <dd className="font-mono text-ink">{formatNumber(headCount)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <dt className="text-ink-soft">Peso total</dt>
          <dd className="font-mono text-ink">
            {formatKg(totalWeightKg)} · {formatArroba(kgToArroba(totalWeightKg))}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <dt className="text-ink-soft">Taxa de lotação</dt>
          <dd className="font-mono font-medium text-ink">{formatNumber(auPerHa, 2)} UA/ha</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/lots"
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver lotes
        </Link>
      </div>
    </div>
  );
}

/**
 * One invernada's outline. Split out and memoized so a selection, a toast or any
 * unrelated store update stops rebuilding `positions` and `pathOptions` for
 * every polygon on the map — harmless while the map only reads, destructive
 * once an outline is being edited, since Leaflet would apply the rebuilt
 * positions over the trace in progress.
 */
const InvernadaPolygon = memo(function InvernadaPolygon({
  summary,
  isSelected,
  isDrawing,
  onSelect,
}: {
  summary: InvernadaWithSummary & {
    invernada: Invernada & { boundary: [number, number][] };
  };
  isSelected: boolean;
  /** While tracing, a tap on an invernada is a vertex — never a selection. */
  isDrawing: boolean;
  onSelect: (id: string) => void;
}) {
  const { invernada, lots, auPerHa, classification } = summary;
  const positions = useMemo(
    () => toLatLngRing(invernada.boundary),
    [invernada.boundary]
  );
  const pathOptions = useMemo(() => {
    const color = CLASSIFICATION_COLOR[classification];
    return {
      color,
      weight: isSelected ? 3 : 1.5,
      fillColor: color,
      fillOpacity: isSelected ? 0.5 : 0.3,
    };
  }, [classification, isSelected]);

  return (
    <Polygon
      positions={positions}
      pathOptions={pathOptions}
      eventHandlers={{
        click: () => {
          if (!isDrawing) onSelect(invernada.id);
        },
      }}
    >
      <Tooltip direction="center" className="text-center">
        <span className="block font-medium">{invernadaLabel(invernada)}</span>
        <span className="block text-xs">
          {lots.length === 0
            ? "Sem lote"
            : lots.map((lot) => lot.name).join(", ")}
        </span>
        <span className="block font-mono text-xs">
          {formatNumber(auPerHa, 2)} UA/ha
        </span>
      </Tooltip>
    </Polygon>
  );
});

/**
 * Keeps the viewport on the drawn invernadas. `MapContainer` reads `bounds`
 * only at mount, so without this the map never follows an area being drawn or
 * redrawn.
 * Keyed by the serialized bounds: refitting on every render would fight the
 * user's own panning, and during a trace it would yank the map mid-gesture.
 */
function FitBounds({ bounds }: { bounds: LatLngBounds | null }) {
  const map = useMap();
  const key = bounds?.toBBoxString() ?? "";
  useEffect(() => {
    if (bounds) map.fitBounds(bounds);
    // `key` is the stable identity of `bounds`; refitting on the object alone
    // would fire every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

/**
 * Hands the Leaflet map instance up to FarmMap. The address search lives
 * outside `MapContainer` (a Leaflet child would be trapped under the tile
 * panes), so flying to a search hit needs the instance lifted out.
 */
function MapHandle({ mapRef }: { mapRef: React.RefObject<LeafletMap | null> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    return () => {
      mapRef.current = null;
    };
  }, [map, mapRef]);
  return null;
}

export function FarmMap() {
  const invernadas = useHerdStore((s) => s.invernadas);
  const lots = useHerdStore((s) => s.lots);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const animals = useHerdStore((s) => s.animals);
  const farm = useHerdStore((s) => s.farm);
  const updateInvernada = useHerdStore((s) => s.updateInvernada);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);

  /*
   * Draw state. `draft` is the trace in progress; `pending` is a closed ring
   * waiting to be assigned to an invernada. `redrawTarget` is set when the
   * farmer is replacing an existing outline — that ring goes straight to its
   * invernada instead of through the dialog.
   */
  const [draft, setDraft] = useState<Ring | null>(null);
  const [pending, setPending] = useState<PendingBoundary | null>(null);
  const [redrawTarget, setRedrawTarget] = useState<string | null>(null);
  const [redrawSaving, setRedrawSaving] = useState(false);
  const [typingCoordinates, setTypingCoordinates] = useState(false);
  const isDrawing = draft !== null;

  /* Address search: the chosen place gets a marker so the farmer sees where
     the map landed, and the viewport flies there. */
  const mapRef = useRef<LeafletMap | null>(null);
  const [searchedPlace, setSearchedPlace] = useState<PlaceHit | null>(null);

  const goToPlace = useCallback((hit: PlaceHit) => {
    setSearchedPlace(hit);
    const map = mapRef.current;
    if (!map) return;
    if (hit.bounds) {
      // A city's bbox can span half a state; capping the zoom-out keeps the
      // jump readable, and maxZoom keeps a single address from diving to
      // rooftop level where the user loses all bearings.
      map.flyToBounds(latLngBounds(hit.bounds), { maxZoom: 16 });
    } else {
      map.flyTo([hit.lat, hit.lng], 15);
    }
  }, []);

  const addVertex = useCallback((point: [number, number]) => {
    setDraft((current) => [...(current ?? []), point]);
  }, []);

  const undoVertex = useCallback(() => {
    setDraft((current) => (current ? current.slice(0, -1) : current));
  }, []);

  const cancelDraw = useCallback(() => {
    setDraft(null);
    setRedrawTarget(null);
  }, []);

  const finishDraw = useCallback(async () => {
    const ring = normalizeRing(draft ?? []);
    if (!isUsableRing(ring)) {
      // Keep the trace visible. The toolbar explains whether unique points are
      // missing or the fence crosses itself.
      setDraft(ring);
      return;
    }
    setDraft(null);
    if (redrawTarget === null) {
      const initialTargetId =
        selectedId !== null &&
        invernadas.some(
          (invernada) =>
            invernada.id === selectedId && invernada.boundary === undefined
        )
          ? selectedId
          : undefined;
      setPending({ ring, initialTargetId });
      return;
    }
    // Replacing a known invernada's outline needs no dialog — the target is known.
    const target = redrawTarget;
    setRedrawTarget(null);
    setRedrawSaving(true);
    try {
      await updateInvernada(target, { boundary: ring });
    } catch {
      // Keep the completed trace available after a transient failure so the
      // farmer can retry without walking or drawing the fence again.
      setRedrawTarget(target);
      setDraft(ring);
    } finally {
      setRedrawSaving(false);
    }
  }, [draft, invernadas, redrawTarget, selectedId, updateInvernada]);

  /*
   * One memo for all three derivations: deriving them with bare `.filter()`
   * produced a new array identity every render, which invalidated the `bounds`
   * memo below and re-pushed `positions` into every polygon.
   */
  const { summaries, withBoundary, withoutBoundary, bounds } = useMemo(() => {
    const all = invernadasWithSummary(invernadas, lots, lotPlacements, animals);
    const drawn = all.filter(
      (s): s is InvernadaWithSummary & {
        invernada: Invernada & { boundary: [number, number][] };
      } => s.invernada.boundary !== undefined
    );
    const points = drawn.flatMap((s) => toLatLngRing(s.invernada.boundary));
    return {
      summaries: all,
      withBoundary: drawn,
      withoutBoundary: all.filter((s) => s.invernada.boundary === undefined),
      bounds: points.length > 0 ? latLngBounds(points).pad(0.15) : null,
    };
  }, [invernadas, lots, lotPlacements, animals]);

  const selected = summaries.find((s) => s.invernada.id === selectedId) ?? null;

  const center: LatLngExpression = farm.headquarters
    ? [farm.headquarters.lat, farm.headquarters.lng]
    : FALLBACK_CENTER;

  const undrawnInvernadas = useMemo(
    () => withoutBoundary.map((s) => s.invernada),
    [withoutBoundary]
  );
  const boundaryTargets = (() => {
    if (!pending?.replaceTargetId) return undrawnInvernadas;
    const replacement = invernadas.find(
      (invernada) => invernada.id === pending.replaceTargetId
    );
    return replacement
      ? [
          replacement,
          ...undrawnInvernadas.filter(
            (invernada) => invernada.id !== replacement.id
          ),
        ]
      : undrawnInvernadas;
  })();

  async function onClearBoundary() {
    if (!selected) return;
    if (!window.confirm(`Apagar o contorno de ${invernadaLabel(selected.invernada)}?`)) {
      return;
    }
    try {
      await updateInvernada(selected.invernada.id, { boundary: null });
    } catch {
      // Store already surfaced the failure.
    }
  }

  return (
    <div className="space-y-4">
      {/* Finding the farm by address beats panning satellite tiles by hand. */}
      <PlaceSearch onSelect={goToPlace} />

      <MapToolbar
        isDrawing={isDrawing}
        disabled={redrawSaving}
        draft={draft ?? []}
        selectedName={selected ? invernadaLabel(selected.invernada) : null}
        selectedHasBoundary={selected?.invernada.boundary !== undefined}
        onStartDraw={() => {
          setRedrawTarget(null);
          setDraft([]);
        }}
        onTypeCoordinates={() => setTypingCoordinates(true)}
        onRedraw={() => {
          if (!selected) return;
          setRedrawTarget(selected.invernada.id);
          setDraft([]);
        }}
        onClearBoundary={onClearBoundary}
        onUndoVertex={undoVertex}
        onFinish={finishDraw}
        onCancel={cancelDraw}
      />

      {summaries.length > 0 ? (
        <section
          aria-labelledby="invernada-map-selector-title"
          className="flex flex-col gap-2 rounded-lg border border-hairline bg-panel px-3 py-2 sm:flex-row sm:items-center"
        >
          <h2
            id="invernada-map-selector-title"
            className="shrink-0 text-sm font-medium text-ink"
          >
            Selecionar invernada
          </h2>
          <ul className="flex flex-wrap gap-2">
            {summaries.map(({ invernada }) => {
              const isSelected = invernada.id === selectedId;
              return (
                <li key={invernada.id}>
                  <Button
                    type="button"
                    size="sm"
                    variant={isSelected ? "default" : "outline"}
                    aria-pressed={isSelected}
                    aria-controls="selected-invernada-summary"
                    disabled={redrawSaving || isDrawing}
                    onClick={() => setSelectedId(invernada.id)}
                    className="min-h-11 max-w-full whitespace-normal"
                  >
                    {invernadaLabel(invernada)}
                    {invernada.boundary ? null : (
                      <span className="text-xs opacity-75">· sem contorno</span>
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {redrawSaving ? (
        <p role="status" className="text-sm text-ink-soft">
          Salvando o novo contorno…
        </p>
      ) : null}

      {tilesFailed ? (
        <p
          role="status"
          className="rounded-lg bg-attention-soft px-3 py-2 text-sm text-attention"
        >
          As imagens de satélite não carregaram. Verifique a conexão — os
          contornos e os códigos das invernadas continuam corretos.
        </p>
      ) : null}

      {/*
        `isolate` is load-bearing, not cosmetic. Leaflet positions its panes at
        z-index 200-1000 and `.leaflet-container` is static, so without a
        stacking context here those values land in the ROOT one and paint over
        every dialog (z-50) and toast on this page. Isolating the wrapper traps
        them inside it. Removing this class silently breaks every overlay on
        the map screen.
      */}
      <div className="isolate overflow-hidden rounded-lg border border-hairline">
        <MapContainer
          {...(bounds ? { bounds } : { center, zoom: 14 })}
          scrollWheelZoom
          className="h-[55dvh] min-h-105 w-full"
        >
          <TileLayer
            url={TILE_URL}
            attribution={TILE_ATTRIBUTION}
            eventHandlers={{
              // A blank grey map is indistinguishable from "no imagery here",
              // "offline" and "the provider blocked us" — so say it out loud.
              tileerror: () => setTilesFailed(true),
              tileload: () => setTilesFailed(false),
            }}
          />
          <MapHandle mapRef={mapRef} />
          {/* Refitting mid-trace would yank the map out from under the tap. */}
          {isDrawing || redrawSaving ? null : <FitBounds bounds={bounds} />}
          {/* CircleMarker, not Marker: Leaflet's default icon assets don't
              survive bundling, and a dot is enough to anchor the eye. */}
          {searchedPlace ? (
            <CircleMarker
              center={[searchedPlace.lat, searchedPlace.lng]}
              radius={8}
              pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#2f6b41", fillOpacity: 0.9 }}
            >
              <Tooltip direction="top">{searchedPlace.name}</Tooltip>
            </CircleMarker>
          ) : null}
          {withBoundary.map((summary) => (
            <InvernadaPolygon
              key={summary.invernada.id}
              summary={summary}
              isSelected={summary.invernada.id === selectedId}
              isDrawing={isDrawing || redrawSaving}
              onSelect={setSelectedId}
            />
          ))}
          {draft ? (
            <DrawLayer
              draft={draft}
              onAddVertex={addVertex}
              onUndoVertex={undoVertex}
              onFinish={finishDraw}
              onCancel={cancelDraw}
            />
          ) : null}
        </MapContainer>
      </div>

      {/* Typed points join the same save flow a trace uses. */}
      <CoordinatesDialog
        open={typingCoordinates}
        onOpenChange={setTypingCoordinates}
        onParsed={(ring) => {
          setTypingCoordinates(false);
          const selectedTarget = invernadas.find(
            (invernada) => invernada.id === selectedId
          );
          setPending({
            ring,
            initialTargetId: selectedTarget?.id,
            replaceTargetId: selectedTarget?.boundary
              ? selectedTarget.id
              : undefined,
          });
        }}
      />

      {/* Mounted per trace, so each one opens on a clean form. */}
      {pending ? (
        <SaveBoundaryDialog
          ring={pending.ring}
          targetInvernadas={boundaryTargets}
          initialTargetId={pending.initialTargetId}
          onSaved={() => setPending(null)}
          onCancel={() => setPending(null)}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
        {(Object.keys(CLASSIFICATION_COLOR) as StockingRateClass[]).map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            {/* A square, not a dot: it stands for the filled pasture on the
                map, not for a status indicator. */}
            <span
              className="size-2.5 rounded-xs"
              style={{ backgroundColor: CLASSIFICATION_COLOR[c] }}
              aria-hidden
            />
            {CLASSIFICATION_LABEL[c]}
          </span>
        ))}
        <span className="ml-auto">
          Cor da invernada = lotação combinada dos lotes (UA/ha)
        </span>
      </div>

      <div id="selected-invernada-summary" aria-live="polite">
        <SectionCard title="Invernada selecionada">
          {selected ? (
            <InvernadaPanel summary={selected} />
          ) : (
            <EmptyState
              icon={Fence}
              title="Selecione uma invernada"
              description="Use o mapa ou a lista acima para ver os lotes atuais e o resumo de ocupação."
            />
          )}
        </SectionCard>
      </div>

      {withoutBoundary.length > 0 ? (
        <p className="text-xs text-ink-soft">
          Sem contorno no mapa:{" "}
          {withoutBoundary.map((s) => invernadaLabel(s.invernada)).join(", ")}. Use
          “Desenhar invernada” para marcar a cerca.
        </p>
      ) : null}
    </div>
  );
}
