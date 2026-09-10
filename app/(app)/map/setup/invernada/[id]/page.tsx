"use client";

/**
 * Tracing one invernada's fence.
 *
 * The same route serves both jobs on purpose: an invernada with no outline is
 * a setup step and continues the walk when it is saved; one that already has an
 * outline is a redraw, reached from its summary, and goes back to the map. What
 * the farmer does with their thumb is identical either way.
 *
 * The trace lives in the flow provider, never in the store — walking a fence is
 * minutes of someone's day, and nothing is persisted until it closes.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { isUsableRing, normalizeRing } from "@/lib/domain/geo";
import { boundaryProgress } from "@/lib/domain/mapSetup";
import { Button } from "@/components/ui/button";
import { DrawControls } from "@/components/map/draw-controls";
import {
  MapPanel,
  MapPanelActions,
  MapPanelHeader,
} from "@/components/map/map-panel";
import { invernadaLabel } from "@/components/map/invernada-label";
import { useMapFlow } from "@/components/map/map-flow-provider";
import { useSetupNavigation } from "@/components/map/use-setup-navigation";

export default function SetupInvernadaPage() {
  const params = useParams<{ id: string }>();
  const invernadaId = decodeURIComponent(params.id);

  const invernadas = useHerdStore((s) => s.invernadas);
  const updateInvernada = useHerdStore((s) => s.updateInvernada);
  const {
    draft,
    startDraw,
    setDraft,
    clearDraft,
    undoVertex,
    registerTraceHandlers,
    skipInvernada,
  } = useMapFlow();
  const { goToNextStep, leaveSetup } = useSetupNavigation();
  const [saving, setSaving] = useState(false);

  const invernada = invernadas.find((item) => item.id === invernadaId) ?? null;
  /*
   * Read once, at mount: saving the outline flips `boundary` to defined, and
   * the answer to "was this a redraw?" must not flip with it — that is what
   * decides whether the flow continues or returns to the map.
   */
  const [isRedraw] = useState(() => invernada?.boundary !== undefined);
  const progress = boundaryProgress(invernadas);

  /** The one meaning of "done", for the buttons and the map's own gestures. */
  const finishTrace = useCallback(async () => {
    const ring = normalizeRing(draft ?? []);
    if (!isUsableRing(ring)) {
      // Keep the trace visible: DrawControls names what is wrong with it.
      setDraft(ring);
      return;
    }
    setSaving(true);
    try {
      await updateInvernada(invernadaId, { boundary: ring });
      clearDraft();
      if (isRedraw) leaveSetup();
      else goToNextStep();
    } catch {
      // Keep the completed trace after a transient failure, so the farmer can
      // retry without walking or drawing the fence again.
      setDraft(ring);
    } finally {
      setSaving(false);
    }
  }, [
    clearDraft,
    draft,
    goToNextStep,
    invernadaId,
    isRedraw,
    leaveSetup,
    setDraft,
    updateInvernada,
  ]);

  const cancelTrace = useCallback(() => {
    clearDraft();
    leaveSetup();
  }, [clearDraft, leaveSetup]);

  // A fresh trace on arrival, cleared on the way out.
  useEffect(() => {
    startDraw();
    return () => clearDraft();
    // Once per invernada: re-running would wipe the trace in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invernadaId]);

  // A double tap, Enter, or a tap on the first vertex closes the outline; the
  // map surface fires these, this page decides what they mean.
  useEffect(
    () =>
      registerTraceHandlers({
        onFinish: () => void finishTrace(),
        onCancel: cancelTrace,
      }),
    [cancelTrace, finishTrace, registerTraceHandlers]
  );

  if (!invernada) {
    return (
      <MapPanel>
        <MapPanelHeader
          title="Invernada não encontrada"
          description="Ela pode ter sido removida em Ajustes, ou o link está velho."
        />
        <MapPanelActions>
          <Button asChild className="min-h-11">
            <Link href="/map">Voltar ao mapa</Link>
          </Button>
        </MapPanelActions>
      </MapPanel>
    );
  }

  return (
    <MapPanel tone="attention">
      <MapPanelHeader
        eyebrow={
          isRedraw
            ? "Redesenhar"
            : `${progress.drawn} de ${progress.total} invernadas contornadas`
        }
        title={`Contorne a ${invernadaLabel(invernada)}`}
        description="Toque em cada canto da cerca, na ordem. Toque no primeiro ponto — ou dê dois toques — para fechar."
      />

      <div className="mt-3">
        <DrawControls
          draft={draft ?? []}
          saving={saving}
          finishLabel={isRedraw ? "Salvar contorno" : "Salvar e continuar"}
          onUndoVertex={undoVertex}
          onFinish={() => void finishTrace()}
          onCancel={cancelTrace}
        />
      </div>

      {!isRedraw ? (
        <MapPanelActions className="mt-2 border-t border-attention/20 pt-3">
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => {
              clearDraft();
              skipInvernada(invernadaId);
              goToNextStep();
            }}
            className="min-h-11 text-ink-soft"
          >
            Pular esta invernada
          </Button>
        </MapPanelActions>
      ) : null}
    </MapPanel>
  );
}
