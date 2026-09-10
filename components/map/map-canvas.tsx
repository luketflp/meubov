"use client";

/**
 * The map surface, and nothing else: satellite tiles, one polygon per drawn
 * invernada, the trace in progress and the marker for a searched place.
 *
 * Every control, panel and step lives above it as an overlay (see the map
 * layout), so this component never has to reason about buttons — and the
 * overlay never has to reason about panes. Mounted once by the layout, it
 * survives navigation between the setup steps.
 *
 * Client-only: Leaflet touches `window`, so the layout imports this with
 * `next/dynamic` and `ssr: false`.
 */
import { memo, useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
} from "react-leaflet";
import {
  latLngBounds,
  type LatLngBounds,
  type LatLngExpression,
  type Map as LeafletMap,
} from "leaflet";
import "leaflet/dist/leaflet.css";
import { useHerdStore } from "@/lib/store/useHerdStore";
import {
  invernadasWithSummary,
  type InvernadaWithSummary,
} from "@/lib/store/selectors";
import type { Invernada, StockingRateClass } from "@/lib/types";
import { toLatLngRing } from "@/lib/domain/geo";
import { formatNumber } from "@/lib/domain/format";
import { DrawLayer } from "@/components/map/draw-layer";
import { useMapFlow } from "@/components/map/map-flow-provider";
import { invernadaLabel } from "@/components/map/invernada-label";

/** Esri World Imagery — free satellite tiles with attribution, no API key. */
const TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const TILE_ATTRIBUTION =
  "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics";

/** Fallback center (Uberaba-MG countryside) when nothing is drawn yet. */
const FALLBACK_CENTER: LatLngExpression = [-19.75, -47.93];
/** Zoom used with a center, when the saved view carries none. */
const DEFAULT_ZOOM = 14;
/** Close enough to read a fence line, far enough to keep bearings. */
const PLACE_ZOOM = 15;

/** Polygon color per stocking class — same tones as the StatusPill. */
export const CLASSIFICATION_COLOR: Record<StockingRateClass, string> = {
  high: "#9a3324",
  good: "#2f6b41",
  light: "#3f6379",
};

export const CLASSIFICATION_LABEL: Record<StockingRateClass, string> = {
  high: "Lotação alta",
  good: "Lotação boa",
  light: "Folgada",
};

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
          {lots.length === 0 ? "Sem lote" : lots.map((lot) => lot.name).join(", ")}
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
 * Hands the Leaflet instance to the flow provider and flies to whatever place
 * the search picked. Both need to happen inside `MapContainer`, where the
 * instance exists; everything else reads it from `mapRef`.
 */
function MapBindings({ mapRef }: { mapRef: React.RefObject<LeafletMap | null> }) {
  const map = useMap();
  const { searchedPlace } = useMapFlow();

  useEffect(() => {
    mapRef.current = map;
    return () => {
      mapRef.current = null;
    };
  }, [map, mapRef]);

  useEffect(() => {
    if (!searchedPlace) return;
    if (searchedPlace.bounds) {
      // A city's bbox can span half a state; capping the zoom-out keeps the
      // jump readable, and maxZoom keeps a single address from diving to
      // rooftop level where the user loses all bearings.
      map.flyToBounds(latLngBounds(searchedPlace.bounds), { maxZoom: 16 });
    } else {
      map.flyTo([searchedPlace.lat, searchedPlace.lng], PLACE_ZOOM);
    }
  }, [map, searchedPlace]);

  return null;
}

export function MapCanvas() {
  const invernadas = useHerdStore((s) => s.invernadas);
  const lots = useHerdStore((s) => s.lots);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const animals = useHerdStore((s) => s.animals);
  const farm = useHerdStore((s) => s.farm);
  const {
    mapRef,
    draft,
    isDrawing,
    addVertex,
    undoVertex,
    requestFinish,
    requestCancel,
    selectedId,
    setSelectedId,
    searchedPlace,
  } = useMapFlow();
  const [tilesFailed, setTilesFailed] = useState(false);

  /*
   * One memo for both derivations: deriving them with bare `.filter()` produced
   * a new array identity every render, which invalidated the `bounds` memo and
   * re-pushed `positions` into every polygon.
   */
  const { withBoundary, bounds } = useMemo(() => {
    const all = invernadasWithSummary(invernadas, lots, lotPlacements, animals);
    const drawn = all.filter(
      (
        s
      ): s is InvernadaWithSummary & {
        invernada: Invernada & { boundary: [number, number][] };
      } => s.invernada.boundary !== undefined
    );
    const points = drawn.flatMap((s) => toLatLngRing(s.invernada.boundary));
    return {
      withBoundary: drawn,
      bounds: points.length > 0 ? latLngBounds(points).pad(0.15) : null,
    };
  }, [invernadas, lots, lotPlacements, animals]);

  /*
   * Where the map opens, in order: the view the farmer saved as the sede, the
   * outlines already drawn, and only then a fixed center. The saved view wins
   * over the outlines on purpose — it is the one choice someone made
   * deliberately, and a farm can have invernadas registered with no outline at
   * all, which is exactly when the fixed center is most wrong.
   */
  const savedView = farm.headquarters;
  const center: LatLngExpression = savedView
    ? [savedView.lat, savedView.lng]
    : FALLBACK_CENTER;

  return (
    <>
      <MapContainer
        {...(savedView
          ? { center, zoom: savedView.zoom ?? DEFAULT_ZOOM }
          : bounds
            ? { bounds }
            : { center, zoom: DEFAULT_ZOOM })}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
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
        {/* Bottom right: the top corners belong to the search and the menu. */}
        <ZoomControl position="bottomright" />
        <MapBindings mapRef={mapRef} />
        {/*
          Refitting mid-trace would yank the map out from under the tap, and a
          saved sede is a deliberate view that auto-fitting would override.
        */}
        {isDrawing || savedView ? null : <FitBounds bounds={bounds} />}
        {/* CircleMarker, not Marker: Leaflet's default icon assets don't
            survive bundling, and a dot is enough to anchor the eye. */}
        {searchedPlace ? (
          <CircleMarker
            center={[searchedPlace.lat, searchedPlace.lng]}
            radius={8}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: "#2f6b41",
              fillOpacity: 0.9,
            }}
          >
            <Tooltip direction="top">{searchedPlace.name}</Tooltip>
          </CircleMarker>
        ) : null}
        {withBoundary.map((summary) => (
          <InvernadaPolygon
            key={summary.invernada.id}
            summary={summary}
            isSelected={summary.invernada.id === selectedId}
            isDrawing={isDrawing}
            onSelect={setSelectedId}
          />
        ))}
        {draft ? (
          <DrawLayer
            draft={draft}
            onAddVertex={addVertex}
            onUndoVertex={undoVertex}
            onFinish={requestFinish}
            onCancel={requestCancel}
          />
        ) : null}
      </MapContainer>

      {tilesFailed ? (
        <p
          role="status"
          className="pointer-events-none absolute inset-x-3 bottom-3 z-[1100] rounded-lg bg-attention-soft px-3 py-2 text-center text-sm text-attention shadow-md md:inset-x-auto md:left-1/2 md:-translate-x-1/2"
        >
          As imagens de satélite não carregaram. Verifique a conexão — os
          contornos continuam corretos.
        </p>
      ) : null}
    </>
  );
}
