"use client";

/**
 * Farm satellite map (Phase 1, read-only): Esri World Imagery tiles with one
 * translucent polygon per pasto, colored by stocking-rate classification —
 * the same semantics as the StatusPill (alta/boa/folgada), so color = state.
 * Tapping a polygon opens the summary panel with the lot's numbers and
 * shortcuts into the transfer/manejo flows.
 *
 * Client-only: Leaflet touches `window`, so the page imports this component
 * with `next/dynamic` and `ssr: false`.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { MapContainer, Polygon, TileLayer, Tooltip } from "react-leaflet";
import { latLngBounds, type LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import area from "@turf/area";
import { Fence } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { lotsWithSummary, type LotWithSummary } from "@/lib/store/selectors";
import type { StockingRateClass } from "@/lib/types";
import { formatArroba, formatKg, formatNumber } from "@/lib/domain/format";
import { kgToArroba } from "@/lib/domain/weights";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";

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

/** [lng, lat] ring (GeoJSON order) → Leaflet [lat, lng] positions. */
function toLeafletRing(boundary: [number, number][]): LatLngExpression[] {
  return boundary.map(([lng, lat]) => [lat, lng]);
}

/** Measured area (ha) of an open [lng, lat] ring. */
function measuredHectares(boundary: [number, number][]): number {
  const ring = [...boundary, boundary[0]];
  return area({ type: "Polygon", coordinates: [ring] }) / 10_000;
}

function LotPanel({ summary }: { summary: LotWithSummary }) {
  const { lot, headCount, totalWeightKg, auPerHa, classification } = summary;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-base font-semibold text-ink">{lot.name}</h3>
        <StatusPill status={classification} withDot />
      </div>
      <dl className="grid gap-1.5 text-sm sm:grid-cols-2">
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <dt className="text-ink-soft">Capim</dt>
          <dd className="text-ink">{lot.grass}</dd>
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <dt className="text-ink-soft">Área</dt>
          <dd className="font-mono text-ink">
            {formatNumber(lot.hectares)} ha
            {lot.boundary ? (
              <span className="text-xs text-ink-soft">
                {" "}
                · {formatNumber(measuredHectares(lot.boundary), 1)} ha no mapa
              </span>
            ) : null}
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
          href="/movements"
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Transferir animais
        </Link>
        <Link
          href="/manejo"
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Iniciar manejo
        </Link>
      </div>
    </div>
  );
}

export function FarmMap() {
  const lots = useHerdStore((s) => s.lots);
  const animals = useHerdStore((s) => s.animals);
  const farm = useHerdStore((s) => s.farm);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const summaries = useMemo(() => lotsWithSummary(lots, animals), [lots, animals]);
  const withBoundary = summaries.filter(
    (s): s is LotWithSummary & { lot: { boundary: [number, number][] } } =>
      s.lot.boundary !== undefined
  );
  const withoutBoundary = summaries.filter((s) => s.lot.boundary === undefined);
  const selected = summaries.find((s) => s.lot.id === selectedId) ?? null;

  const bounds = useMemo(() => {
    const points = withBoundary.flatMap((s) => toLeafletRing(s.lot.boundary));
    return points.length > 0 ? latLngBounds(points as [number, number][]).pad(0.15) : null;
  }, [withBoundary]);

  const center: LatLngExpression = farm.headquarters
    ? [farm.headquarters.lat, farm.headquarters.lng]
    : FALLBACK_CENTER;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-hairline">
        <MapContainer
          {...(bounds ? { bounds } : { center, zoom: 14 })}
          scrollWheelZoom
          className="h-[55dvh] min-h-105 w-full"
        >
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
          {withBoundary.map((summary) => {
            const color = CLASSIFICATION_COLOR[summary.classification];
            const isSelected = summary.lot.id === selectedId;
            return (
              <Polygon
                key={summary.lot.id}
                positions={toLeafletRing(summary.lot.boundary)}
                pathOptions={{
                  color,
                  weight: isSelected ? 3 : 1.5,
                  fillColor: color,
                  fillOpacity: isSelected ? 0.5 : 0.3,
                }}
                eventHandlers={{ click: () => setSelectedId(summary.lot.id) }}
              >
                <Tooltip direction="center" className="font-medium">
                  {summary.lot.name}
                </Tooltip>
              </Polygon>
            );
          })}
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
        {(Object.keys(CLASSIFICATION_COLOR) as StockingRateClass[]).map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: CLASSIFICATION_COLOR[c] }}
              aria-hidden
            />
            {CLASSIFICATION_LABEL[c]}
          </span>
        ))}
        <span className="ml-auto">Cor do pasto = taxa de lotação (UA/ha)</span>
      </div>

      <SectionCard title="Pasto selecionado">
        {selected ? (
          <LotPanel summary={selected} />
        ) : (
          <EmptyState
            icon={Fence}
            title="Toque em um pasto no mapa"
            description="O resumo de ocupação do pasto aparece aqui."
          />
        )}
      </SectionCard>

      {withoutBoundary.length > 0 ? (
        <p className="text-xs text-ink-soft">
          Sem contorno no mapa:{" "}
          {withoutBoundary.map((s) => s.lot.name).join(", ")}. O desenho de pastos
          chega na próxima fase.
        </p>
      ) : null}
    </div>
  );
}
