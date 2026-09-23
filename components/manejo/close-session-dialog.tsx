"use client";

/**
 * "N animais não passaram": what "Encerrar" asks when the line is not clean.
 * It names every animal left behind — the ones still in the line, with where
 * they are and their last weight, and the ones skipped, with the note they
 * were skipped with — so the farmer knows who to look for before the manejo
 * is over. "Levar ao brete" puts one of the line back in the brete; closing
 * anyway records them as they are (não passou, pulado).
 */
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Animal, Lot, ManejoSessionAnimal } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/domain/labels";
import { currentWeight } from "@/lib/domain/weights";
import { formatKg, formatNumber } from "@/lib/domain/format";
import { notPassedTitle } from "@/components/manejo/helpers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface CloseSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  done: number;
  pending: ManejoSessionAnimal[];
  skipped: ManejoSessionAnimal[];
  byTag: ReadonlyMap<string, Animal>;
  lots: readonly Lot[];
  /** "Pulados", or "Puladas" on an inseminação. */
  skippedLabel: string;
  /** Takes the animal back to the brete; the dialog closes. */
  onBring: (earTag: string) => void;
  onConfirm: () => Promise<void>;
}

function Count({ tone, children }: { tone: "healthy" | "overdue" | "attention"; children: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        tone === "healthy" && "bg-healthy-soft text-healthy",
        tone === "overdue" && "bg-overdue-soft text-overdue",
        tone === "attention" && "bg-attention-soft text-attention"
      )}
    >
      {children}
    </span>
  );
}

function GroupCaption({ tone, children }: { tone: "overdue" | "attention"; children: string }) {
  return (
    <p className="mb-1 flex items-center gap-2 text-[11px] font-medium tracking-wide text-ink-soft uppercase">
      <span
        aria-hidden
        className={cn("size-2 rounded-full", tone === "overdue" ? "bg-overdue" : "bg-attention")}
      />
      {children}
    </p>
  );
}

export function CloseSessionDialog({
  open,
  onOpenChange,
  done,
  pending,
  skipped,
  byTag,
  lots,
  skippedLabel,
  onBring,
  onConfirm,
}: CloseSessionDialogProps) {
  const [closing, setClosing] = useState(false);

  /** "Novilha · Lote Engorda · último peso 412 kg" for an animal of the line. */
  function herdLine(earTag: string): string {
    const animal = byTag.get(earTag);
    if (!animal) return "";
    const lot = lots.find((l) => l.id === animal.lotId)?.name ?? "sem lote";
    const last = currentWeight(animal);
    const weight = last === null ? "sem pesagem" : `último peso ${formatKg(last)}`;
    return `${CATEGORY_LABEL[animal.category]} · ${lot} · ${weight}`;
  }

  async function confirm() {
    setClosing(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setClosing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (closing ? undefined : onOpenChange(next))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{notPassedTitle(pending.length + skipped.length)}</DialogTitle>
          <DialogDescription>
            Confira antes de encerrar: quem ficou na fila fica no manejo como{" "}
            <span className="font-medium text-ink">não passou</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {done > 0 ? (
            <Count tone="healthy">{done === 1 ? "1 passou" : `${formatNumber(done)} passaram`}</Count>
          ) : null}
          {pending.length > 0 ? (
            <Count tone="overdue">{`${formatNumber(pending.length)} na fila`}</Count>
          ) : null}
          {skipped.length > 0 ? (
            <Count tone="attention">
              {`${formatNumber(skipped.length)} ${
                skipped.length === 1 ? skippedLabel.slice(0, -1).toLowerCase() : skippedLabel.toLowerCase()
              }`}
            </Count>
          ) : null}
        </div>

        <div className="-mx-4 max-h-[50vh] space-y-4 overflow-y-auto px-4">
          {pending.length > 0 ? (
            <div>
              <GroupCaption tone="overdue">{`Ficaram na fila (${formatNumber(pending.length)})`}</GroupCaption>
              <ul className="divide-y divide-hairline border-t border-hairline">
                {pending.map((entry) => (
                  <li key={entry.earTag} className="flex min-h-13 items-center gap-3 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-sm font-medium text-ink">
                        {entry.earTag}
                      </span>
                      <span className="block text-xs text-ink-soft">
                        {herdLine(entry.earTag)}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11 shrink-0 text-brand md:min-h-8"
                      disabled={closing}
                      onClick={() => {
                        onBring(entry.earTag);
                        onOpenChange(false);
                      }}
                      aria-label={`Levar ${entry.earTag} ao brete`}
                    >
                      Levar ao brete
                      <ArrowRight data-icon="inline-end" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {skipped.length > 0 ? (
            <div>
              <GroupCaption tone="attention">{`${skippedLabel} (${formatNumber(skipped.length)})`}</GroupCaption>
              <ul className="divide-y divide-hairline border-t border-hairline">
                {skipped.map((entry) => (
                  <li key={entry.earTag} className="flex min-h-11 items-center gap-3 py-1.5">
                    <span className="font-mono text-sm font-medium text-ink">{entry.earTag}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">
                      {entry.notes ?? "sem observação"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 md:min-h-8"
            disabled={closing}
            onClick={() => onOpenChange(false)}
          >
            Voltar ao brete
          </Button>
          <Button type="button" className="min-h-11 md:min-h-8" disabled={closing} onClick={confirm}>
            Encerrar assim mesmo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
