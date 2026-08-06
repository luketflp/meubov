"use client";

/**
 * "Digitar coordenadas": builds an outline from typed or pasted points instead
 * of tracing over imagery.
 *
 * This is the exact path for a farm that already owns its geometry — a handheld
 * GPS, a surveyor's point list, coordinates read off a memorial — and the only
 * honest one when the satellite imagery over the property is years old or under
 * cloud, where a traced fence would be confidently wrong.
 *
 * The parsed ring is handed upward and joins the same save flow a trace uses,
 * so assignment, validation and persistence are shared.
 */
import { useMemo, useState } from "react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { parseCoordinateList } from "@/lib/domain/coordinates";
import {
  MIN_RING_VERTICES,
  isSelfIntersecting,
  isUsableRing,
  isValidRing,
  ringAreaHectares,
  type Ring,
} from "@/lib/domain/geo";
import { formatNumber } from "@/lib/domain/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const PLACEHOLDER = `-19.720000, -47.910000
-19.720000, -47.903320
-19.714590, -47.903320

ou em graus:
19°43'12"S 47°54'36"O`;

export function CoordinatesDialog({
  open,
  onOpenChange,
  onParsed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives a validated ring, ready to be assigned to an invernada. */
  onParsed: (ring: Ring) => void;
}) {
  const invernadas = useHerdStore((s) => s.invernadas);
  const [text, setText] = useState("");

  const parsed = useMemo(() => parseCoordinateList(text), [text]);
  const selfIntersects = useMemo(
    () => isValidRing(parsed.ring) && isSelfIntersecting(parsed.ring),
    [parsed.ring]
  );
  const enoughPoints = parsed.ring.length >= MIN_RING_VERTICES;

  /** Shown so a paste that is wildly off is obvious before it is saved. */
  const measured = enoughPoints ? ringAreaHectares(parsed.ring) : 0;
  const usableOutline = isUsableRing(parsed.ring);
  const canUse = usableOutline && parsed.errors.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setText("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Digitar coordenadas</DialogTitle>
          <DialogDescription>
            Um ponto por linha, <strong>latitude primeiro</strong> — a mesma
            ordem que o GPS e o Google Maps mostram. Aceita graus decimais
            (-19.72) ou graus, minutos e segundos (19°43&apos;12&quot;S).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="coordinates-input">Pontos da cerca</Label>
            <Textarea
              id="coordinates-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={9}
              className="font-mono text-sm"
              spellCheck={false}
            />
          </div>

          {text.trim() !== "" ? (
            <div className="grid gap-2 text-sm">
              <p className="text-ink-soft">
                {parsed.ring.length}{" "}
                {parsed.ring.length === 1 ? "ponto lido" : "pontos lidos"}
                {enoughPoints ? ` · ${formatNumber(measured, 1)} ha` : null}
              </p>

              {!enoughPoints && parsed.errors.length === 0 ? (
                <p className="text-ink-soft">
                  Faltam pontos: uma cerca precisa de pelo menos{" "}
                  {MIN_RING_VERTICES}.
                </p>
              ) : null}

              {parsed.reversedSuspected ? (
                <p
                  role="status"
                  className="rounded-lg bg-attention-soft px-3 py-2 text-attention"
                >
                  Estes pontos caem fora do Brasil, mas ficariam dentro se
                  invertidos. Confira se a longitude não veio primeiro.
                </p>
              ) : null}

              {selfIntersects ? (
                <p className="text-overdue">
                  A cerca se cruza. Confira a ordem dos pontos — eles precisam
                  seguir o contorno, um após o outro.
                </p>
              ) : null}

              {enoughPoints && !selfIntersects && !usableOutline ? (
                <p className="text-overdue">
                  O contorno repete pontos ou não forma uma área. Confira se a
                  lista segue toda a cerca, sem voltar pelo mesmo ponto.
                </p>
              ) : null}

              {parsed.errors.length > 0 ? (
                <ul className="grid gap-1 text-overdue">
                  {parsed.errors.slice(0, 5).map((error) => (
                    <li key={error.line}>
                      Linha {error.line} (&quot;{error.text}&quot;): {error.reason}
                    </li>
                  ))}
                  {parsed.errors.length > 5 ? (
                    <li>e mais {parsed.errors.length - 5} linha(s) com problema.</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-ink-soft">
              {invernadas.length === 0
                ? "Você poderá cadastrar a invernada ao salvar este contorno."
                : "Cole a lista de pontos do GPS, do topógrafo ou do memorial."}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="min-h-11"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!canUse}
            onClick={() => {
              onParsed(parsed.ring);
              setText("");
            }}
            className="min-h-11"
          >
            Usar estas coordenadas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
