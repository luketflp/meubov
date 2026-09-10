"use client";

/**
 * Tracing a fence for an invernada that does not exist yet.
 *
 * This is the cold start — a farm that opened the map before registering
 * anything — and also the "trace another" at the end of the walk. The outline
 * comes first and the registration second, because on the ground the fence is
 * the thing that exists; the code, the grass and the hectares are what someone
 * types about it afterwards.
 *
 * Static segment, so it always wins over `[id]`: no invernada may be called
 * "nova".
 */
import { useCallback, useEffect, useState } from "react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { isUsableRing, normalizeRing, type Ring } from "@/lib/domain/geo";
import { undrawnInvernadas } from "@/lib/domain/mapSetup";
import { DrawControls } from "@/components/map/draw-controls";
import { MapPanel, MapPanelHeader } from "@/components/map/map-panel";
import { SaveBoundaryDialog } from "@/components/map/save-boundary-dialog";
import { useMapFlow } from "@/components/map/map-flow-provider";
import { useSetupNavigation } from "@/components/map/use-setup-navigation";

export default function SetupNewInvernadaPage() {
  const invernadas = useHerdStore((s) => s.invernadas);
  const {
    draft,
    startDraw,
    setDraft,
    clearDraft,
    undoVertex,
    registerTraceHandlers,
  } = useMapFlow();
  const { goToNextStep, leaveSetup } = useSetupNavigation();
  /** The closed outline, held here while the farmer names the invernada. */
  const [pendingRing, setPendingRing] = useState<Ring | null>(null);

  const finishTrace = useCallback(() => {
    const ring = normalizeRing(draft ?? []);
    if (!isUsableRing(ring)) {
      // Keep the trace visible: DrawControls names what is wrong with it.
      setDraft(ring);
      return;
    }
    // Off the map and into the form: the dialog is the only thing that can
    // persist it, and until it does, this state is the only copy.
    clearDraft();
    setPendingRing(ring);
  }, [clearDraft, draft, setDraft]);

  const cancelTrace = useCallback(() => {
    clearDraft();
    leaveSetup();
  }, [clearDraft, leaveSetup]);

  useEffect(() => {
    startDraw();
    return () => clearDraft();
    // Once, on arrival: re-running would wipe the trace in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => registerTraceHandlers({ onFinish: finishTrace, onCancel: cancelTrace }),
    [cancelTrace, finishTrace, registerTraceHandlers]
  );

  return (
    <>
      <MapPanel tone="attention">
        <MapPanelHeader
          eyebrow={
            invernadas.length === 0
              ? "Primeira invernada"
              : `${invernadas.length} invernadas cadastradas`
          }
          title="Contorne a cerca desta invernada"
          description="Toque em cada canto da cerca, na ordem. Ao fechar o contorno você dá o número, o capim e a área — a medida do mapa já vem preenchida."
        />
        <div className="mt-3">
          <DrawControls
            draft={draft ?? []}
            finishLabel="Concluir contorno"
            onUndoVertex={undoVertex}
            onFinish={finishTrace}
            onCancel={cancelTrace}
          />
        </div>
      </MapPanel>

      {pendingRing ? (
        <SaveBoundaryDialog
          ring={pendingRing}
          // An outline traced here may also belong to an invernada that was
          // registered in Ajustes and never drawn.
          targetInvernadas={undrawnInvernadas(invernadas)}
          preferNew
          onSaved={() => {
            setPendingRing(null);
            goToNextStep();
          }}
          onCancel={() => {
            // Give the trace back rather than making them walk it again.
            setDraft(pendingRing);
            setPendingRing(null);
          }}
        />
      ) : null}
    </>
  );
}
