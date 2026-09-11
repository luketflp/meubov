"use client";

/**
 * What the farmer sees while walking a fence: how the trace is going, and the
 * three things they can do about it.
 *
 * The message is the whole point. A trace fails in ways that look identical on
 * screen — too few points, the same point twice, a fence that crosses itself —
 * so each one is named, and "Concluir" stays disabled until the ring can
 * actually close.
 *
 * Buttons are React, not Leaflet controls: Leaflet's own are 26x26 px (30 on
 * touch), well under the 44 px target this app holds itself to everywhere else.
 */
import { Undo2, X } from "lucide-react";
import {
  MIN_RING_VERTICES,
  isSelfIntersecting,
  isUsableRing,
  normalizeRing,
  ringAreaHectares,
  type Ring,
} from "@/lib/domain/geo";
import { formatNumber } from "@/lib/domain/format";
import { Button } from "@/components/ui/button";
import { MapPanelActions } from "@/components/map/map-panel";

/** Says how the trace is doing, in the farmer's terms. */
function traceStatus(draft: Ring): { text: string; canClose: boolean } {
  const normalized = normalizeRing(draft);
  const enoughUniquePoints = normalized.length >= MIN_RING_VERTICES;
  const selfIntersects = enoughUniquePoints && isSelfIntersecting(normalized);
  const canClose = isUsableRing(normalized);

  if (selfIntersects) {
    return {
      canClose: false,
      text: "A cerca se cruza. Desfaça pontos e siga o contorno em ordem.",
    };
  }
  if (enoughUniquePoints && !canClose) {
    return {
      canClose: false,
      text: "O contorno repete pontos ou não forma uma área. Desfaça e siga toda a cerca.",
    };
  }
  if (canClose) {
    return {
      canClose: true,
      text: `${normalized.length} pontos · ${formatNumber(ringAreaHectares(normalized), 1)} ha`,
    };
  }
  if (draft.length >= MIN_RING_VERTICES) {
    return {
      canClose: false,
      text: `Marque pelo menos ${MIN_RING_VERTICES} pontos diferentes para fechar a cerca.`,
    };
  }
  return {
    canClose: false,
    text: `Toque no mapa para marcar a cerca (${draft.length}/${MIN_RING_VERTICES} pontos)`,
  };
}

export function DrawControls({
  draft,
  saving,
  finishLabel = "Concluir",
  onUndoVertex,
  onFinish,
  onCancel,
}: {
  draft: Ring;
  /** Blocks every action while the finished ring is being persisted. */
  saving?: boolean;
  finishLabel?: string;
  onUndoVertex: () => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
  const { text, canClose } = traceStatus(draft);

  return (
    <>
      <p role="status" className="text-sm text-attention">
        {saving ? "Salvando o contorno…" : text}
      </p>
      <MapPanelActions>
        <Button
          type="button"
          variant="outline"
          onClick={onUndoVertex}
          disabled={saving || draft.length === 0}
          className="min-h-11"
        >
          <Undo2 aria-hidden />
          Desfazer ponto
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
          className="min-h-11"
        >
          <X aria-hidden />
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={onFinish}
          disabled={saving || !canClose}
          className="ml-auto min-h-11"
        >
          {finishLabel}
        </Button>
      </MapPanelActions>
    </>
  );
}
