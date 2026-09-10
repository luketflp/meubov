"use client";

/**
 * The operational map: the farm as it is, with the map itself as the selector.
 *
 * Only one panel is ever open — the selected invernada if there is one, the
 * guide if the farm is still incomplete, nothing otherwise. The screen it
 * replaced showed a toolbar, a chip row, a legend and an empty summary card at
 * the same time, on a map that got barely half the height.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { invernadasWithSummary } from "@/lib/store/selectors";
import type { StockingRateClass } from "@/lib/types";
import {
  boundaryProgress,
  nextStep,
  pendingSteps,
  stepHref,
} from "@/lib/domain/mapSetup";
import {
  CLASSIFICATION_COLOR,
  CLASSIFICATION_LABEL,
} from "@/components/map/map-canvas";
import { GuidePanel, GuidePill } from "@/components/map/guide-panel";
import { InvernadaSheet } from "@/components/map/invernada-sheet";
import { invernadaLabel } from "@/components/map/invernada-label";
import { useMapFlow } from "@/components/map/map-flow-provider";

export default function MapPage() {
  const router = useRouter();
  const invernadas = useHerdStore((s) => s.invernadas);
  const lots = useHerdStore((s) => s.lots);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const animals = useHerdStore((s) => s.animals);
  const farm = useHerdStore((s) => s.farm);
  const updateInvernada = useHerdStore((s) => s.updateInvernada);
  const { selectedId, setSelectedId, skipped, guideDismissed, dismissGuide } =
    useMapFlow();
  const [clearing, setClearing] = useState(false);

  const summaries = useMemo(
    () => invernadasWithSummary(invernadas, lots, lotPlacements, animals),
    [invernadas, lots, lotPlacements, animals]
  );
  const selected = summaries.find((s) => s.invernada.id === selectedId) ?? null;

  const step = nextStep(farm, invernadas, skipped);
  const remaining = pendingSteps(farm, invernadas, skipped).filter(
    (pending) => pending.kind !== "headquarters"
  ).length;
  const progress = boundaryProgress(invernadas);
  const hasDrawnInvernada = progress.drawn > 0;

  async function onClearBoundary() {
    if (!selected) return;
    if (
      !window.confirm(`Apagar o contorno de ${invernadaLabel(selected.invernada)}?`)
    ) {
      return;
    }
    setClearing(true);
    try {
      await updateInvernada(selected.invernada.id, { boundary: null });
      setSelectedId(null);
    } catch {
      // Store already surfaced the failure.
    } finally {
      setClearing(false);
    }
  }

  return (
    /* One bottom cluster: the key sits just above whichever panel is open, and
       the whole group is what gets pushed to the foot of the map. */
    <div className="mt-auto flex flex-col gap-2">
      {/* The key only earns its place once a polygon uses it. */}
      {hasDrawnInvernada ? (
        <div className="pointer-events-none flex flex-wrap items-center gap-x-3 gap-y-1 self-start rounded-lg bg-panel/90 px-3 py-1.5 text-xs text-ink-soft shadow-sm backdrop-blur-sm">
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
        </div>
      ) : null}

      {selected ? (
        <InvernadaSheet
          summary={selected}
          busy={clearing}
          onRedraw={() =>
            router.push(stepHref({ kind: "invernada", invernadaId: selected.invernada.id }))
          }
          onClearBoundary={onClearBoundary}
          onClose={() => setSelectedId(null)}
        />
      ) : step === null ? null : guideDismissed ? (
        <GuidePill step={step} remaining={remaining} />
      ) : (
        <GuidePanel
          step={step}
          remaining={remaining}
          drawn={progress.drawn}
          total={progress.total}
          onDismiss={dismissGuide}
        />
      )}
    </div>
  );
}
