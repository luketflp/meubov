"use client";

/**
 * Map controls, in React rather than as a Leaflet control: Leaflet's own
 * buttons are 26x26 px (30 on touch), well under the 44 px target this app
 * holds itself to everywhere else.
 *
 * It sits above the map in normal flow instead of floating over it, so it
 * never covers the ground being traced and needs no z-index fight with the
 * pane stack.
 */
import { Keyboard, MapPin, Pencil, Trash2, Undo2, X } from "lucide-react";
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

export function MapToolbar({
  isDrawing,
  disabled,
  draft,
  selectedName,
  selectedHasBoundary,
  onStartDraw,
  onTypeCoordinates,
  onRedraw,
  onClearBoundary,
  onUndoVertex,
  onFinish,
  onCancel,
}: {
  isDrawing: boolean;
  /** Prevents a second drawing action while a redraw is being persisted. */
  disabled?: boolean;
  draft: Ring;
  /** Display label of the selected invernada, when one is selected. */
  selectedName: string | null;
  selectedHasBoundary: boolean;
  onStartDraw: () => void;
  onTypeCoordinates: () => void;
  onRedraw: () => void;
  onClearBoundary: () => void;
  onUndoVertex: () => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
  if (isDrawing) {
    const normalized = normalizeRing(draft);
    const enoughUniquePoints = normalized.length >= MIN_RING_VERTICES;
    const selfIntersects =
      enoughUniquePoints && isSelfIntersecting(normalized);
    const canClose = isUsableRing(normalized);
    const invalidOutline =
      enoughUniquePoints && !selfIntersects && !canClose;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-attention-soft px-3 py-2">
        <p className="text-sm text-attention" role="status">
          {selfIntersects
            ? "A cerca se cruza. Desfaça pontos e siga o contorno em ordem."
            : invalidOutline
              ? "O contorno repete pontos ou não forma uma área. Desfaça e siga toda a cerca."
            : canClose
              ? `${normalized.length} pontos · ${formatNumber(ringAreaHectares(normalized), 1)} ha`
              : draft.length >= MIN_RING_VERTICES
                ? `Marque pelo menos ${MIN_RING_VERTICES} pontos diferentes para fechar a cerca.`
                : `Toque no mapa para marcar a cerca (${draft.length}/${MIN_RING_VERTICES} pontos)`}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onUndoVertex}
            disabled={disabled || draft.length === 0}
            className="min-h-11"
          >
            <Undo2 aria-hidden />
            Desfazer ponto
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={disabled}
            className="min-h-11"
          >
            <X aria-hidden />
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onFinish}
            disabled={disabled || !canClose}
            className="min-h-11"
          >
            Concluir
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={onStartDraw}
        disabled={disabled}
        className="min-h-11"
      >
        <Pencil aria-hidden />
        Desenhar invernada
      </Button>

      {/* For a farm that already has its points, typing beats tracing. */}
      <Button
        type="button"
        variant="outline"
        onClick={onTypeCoordinates}
        disabled={disabled}
        className="min-h-11"
      >
        <Keyboard aria-hidden />
        Digitar coordenadas
      </Button>

      {selectedName && selectedHasBoundary ? (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onRedraw}
            disabled={disabled}
            className="min-h-11"
          >
            <MapPin aria-hidden />
            Redesenhar {selectedName}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClearBoundary}
            disabled={disabled}
            className="min-h-11 text-ink-soft hover:text-overdue"
          >
            <Trash2 aria-hidden />
            Apagar contorno
          </Button>
        </>
      ) : null}
    </div>
  );
}
