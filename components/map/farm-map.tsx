"use client";

/**
 * Farm satellite map: Esri World Imagery tiles with one translucent polygon per
 * lot, colored by stocking-rate classification — the same semantics as the
 * StatusPill (alta/boa/folgada), so color = state. Tapping a polygon opens the
 * summary panel with the lot's numbers and shortcuts into the manejo flows.
 *
 * Also the drawing surface: this component owns the draw state machine and
 * delegates to MapToolbar (controls), DrawLayer (the trace in progress) and
 * SaveBoundaryDialog (assigning a closed ring to a lot). Nothing is persisted
 * until the farmer confirms.
 *
 * Client-only: Leaflet touches `window`, so the page imports this component
 * with `next/dynamic` and `ssr: false`.
 */
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MapContainer, Polygon, TileLayer, Tooltip, useMap } from "react-leaflet";
import { latLngBounds, type LatLngBounds, type LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Fence } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { lotsWithSummary, type LotWithSummary } from "@/lib/store/selectors";
import type { StockingRateClass } from "@/lib/types";
import {
  normalizeRing,
  ringAreaHectares,
  toLatLngRing,
  type Ring,
} from "@/lib/domain/geo";
import { CoordinatesDialog } from "@/components/map/coordinates-dialog";
import { DrawLayer } from "@/components/map/draw-layer";
import { MapToolbar } from "@/components/map/map-toolbar";
import { SaveBoundaryDialog } from "@/components/map/save-boundary-dialog";
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
                · {formatNumber(ringAreaHectares(lot.boundary), 1)} ha no mapa
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
          href="/lots"
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver lotes
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

/**
 * One lot's outline. Split out and memoized so a selection, a toast or any
 * unrelated store update stops rebuilding `positions` and `pathOptions` for
 * every polygon on the map — harmless while the map only reads, destructive
 * once an outline is being edited, since Leaflet would apply the rebuilt
 * positions over the trace in progress.
 */
const LotPolygon = memo(function LotPolygon({
  summary,
  isSelected,
  isDrawing,
  onSelect,
}: {
  summary: LotWithSummary & { lot: { boundary: [number, number][] } };
  isSelected: boolean;
  /** While tracing, a tap on a lot is a vertex — never a selection. */
  isDrawing: boolean;
  onSelect: (id: string) => void;
}) {
  const { lot, classification } = summary;
  const positions = useMemo(() => toLatLngRing(lot.boundary), [lot.boundary]);
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
          if (!isDrawing) onSelect(lot.id);
        },
      }}
    >
      <Tooltip direction="center" className="font-medium">
        {lot.name}
      </Tooltip>
    </Polygon>
  );
});

/**
 * Keeps the viewport on the drawn lots. `MapContainer` reads `bounds` only at
 * mount, so without this the map never follows a lot being drawn or redrawn.
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

export function FarmMap() {
  const lots = useHerdStore((s) => s.lots);
  const animals = useHerdStore((s) => s.animals);
  const farm = useHerdStore((s) => s.farm);
  const updateLot = useHerdStore((s) => s.updateLot);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);

  /*
   * Draw state. `draft` is the trace in progress; `pending` is a closed ring
   * waiting to be assigned to a lot. `redrawTarget` is set when the farmer is
   * replacing the outline of a lot that already has one — that ring goes
   * straight to its lot instead of through the dialog.
   */
  const [draft, setDraft] = useState<Ring | null>(null);
  const [pending, setPending] = useState<Ring | null>(null);
  const [redrawTarget, setRedrawTarget] = useState<string | null>(null);
  const [typingCoordinates, setTypingCoordinates] = useState(false);
  const isDrawing = draft !== null;

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
    setDraft(null);
    if (redrawTarget === null) {
      setPending(ring);
      return;
    }
    // Replacing a known lot's outline needs no dialog — the target is known.
    const target = redrawTarget;
    setRedrawTarget(null);
    try {
      await updateLot(target, { boundary: ring });
    } catch {
      // The store already raised the toast; the ring is gone either way, so
      // the honest recovery is to draw it again.
    }
  }, [draft, redrawTarget, updateLot]);

  /*
   * One memo for all three derivations: deriving them with bare `.filter()`
   * produced a new array identity every render, which invalidated the `bounds`
   * memo below and re-pushed `positions` into every polygon.
   */
  const { summaries, withBoundary, withoutBoundary, bounds } = useMemo(() => {
    const all = lotsWithSummary(lots, animals);
    const drawn = all.filter(
      (s): s is LotWithSummary & { lot: { boundary: [number, number][] } } =>
        s.lot.boundary !== undefined
    );
    const points = drawn.flatMap((s) => toLatLngRing(s.lot.boundary));
    return {
      summaries: all,
      withBoundary: drawn,
      withoutBoundary: all.filter((s) => s.lot.boundary === undefined),
      bounds: points.length > 0 ? latLngBounds(points).pad(0.15) : null,
    };
  }, [lots, animals]);

  const selected = summaries.find((s) => s.lot.id === selectedId) ?? null;

  const center: LatLngExpression = farm.headquarters
    ? [farm.headquarters.lat, farm.headquarters.lng]
    : FALLBACK_CENTER;

  const undrawnLots = useMemo(
    () => withoutBoundary.map((s) => s.lot),
    [withoutBoundary]
  );

  async function onClearBoundary() {
    if (!selected) return;
    if (!window.confirm(`Apagar o contorno de ${selected.lot.name}?`)) return;
    try {
      await updateLot(selected.lot.id, { boundary: null });
    } catch {
      // Store already surfaced the failure.
    }
  }

  return (
    <div className="space-y-4">
      <MapToolbar
        isDrawing={isDrawing}
        draft={draft ?? []}
        selectedName={selected?.lot.name ?? null}
        selectedHasBoundary={selected?.lot.boundary !== undefined}
        onStartDraw={() => {
          setRedrawTarget(null);
          setDraft([]);
        }}
        onTypeCoordinates={() => setTypingCoordinates(true)}
        onRedraw={() => {
          if (!selected) return;
          setRedrawTarget(selected.lot.id);
          setDraft([]);
        }}
        onClearBoundary={onClearBoundary}
        onUndoVertex={undoVertex}
        onFinish={finishDraw}
        onCancel={cancelDraw}
      />

      {tilesFailed ? (
        <p
          role="status"
          className="rounded-lg bg-attention-soft px-3 py-2 text-sm text-attention"
        >
          As imagens de satélite não carregaram. Verifique a conexão — os
          contornos e os números dos lotes continuam corretos.
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
          {/* Refitting mid-trace would yank the map out from under the tap. */}
          {isDrawing ? null : <FitBounds bounds={bounds} />}
          {withBoundary.map((summary) => (
            <LotPolygon
              key={summary.lot.id}
              summary={summary}
              isSelected={summary.lot.id === selectedId}
              isDrawing={isDrawing}
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
          setPending(ring);
        }}
      />

      {/* Mounted per trace, so each one opens on a clean form. */}
      {pending ? (
        <SaveBoundaryDialog
          ring={pending}
          undrawnLots={undrawnLots}
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
        <span className="ml-auto">Cor do lote = taxa de lotação (UA/ha)</span>
      </div>

      <SectionCard title="Lote selecionado">
        {selected ? (
          <LotPanel summary={selected} />
        ) : (
          <EmptyState
            icon={Fence}
            title="Toque em um lote no mapa"
            description="O resumo de ocupação do lote aparece aqui."
          />
        )}
      </SectionCard>

      {withoutBoundary.length > 0 ? (
        <p className="text-xs text-ink-soft">
          Sem contorno no mapa:{" "}
          {withoutBoundary.map((s) => s.lot.name).join(", ")}. Use “Desenhar
          lote” para marcar a cerca.
        </p>
      ) : null}
    </div>
  );
}
