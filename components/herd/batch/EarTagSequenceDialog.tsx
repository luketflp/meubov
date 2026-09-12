"use client";

/**
 * "Gerar sequência de brincos": prefixo, primeiro número and quantidade become
 * one line per brinco. The preview names the brincos the farm already has, so
 * the farmer knows which lines will arrive flagged.
 */
import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { sequenceEarTags } from "@/lib/domain/animalBatch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EarTagSequenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lines still free in the list. */
  room: number;
  existingEarTags: readonly string[];
  onAdd: (earTags: string[]) => void;
}

const LIST_FORMAT = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" });

/** "BR-1004 e BR-1017", or "BR-1, BR-2, BR-3 e mais 4" past three. */
function nameTags(earTags: readonly string[]): string {
  if (earTags.length <= 3) return LIST_FORMAT.format(earTags);
  return `${earTags.slice(0, 3).join(", ")} e mais ${earTags.length - 3}`;
}

function previewText(earTags: readonly string[]): string {
  if (earTags.length <= 4) return earTags.join(", ");
  return `${earTags.slice(0, 3).join(", ")} … ${earTags[earTags.length - 1]}`;
}

/** Lives inside DialogContent, which unmounts on close: every open starts empty. */
function SequenceForm({ room, existingEarTags, onAdd }: Omit<EarTagSequenceDialogProps, "open" | "onOpenChange">) {
  const [prefix, setPrefix] = useState("");
  const [first, setFirst] = useState("");
  const [quantity, setQuantity] = useState("");

  const requested = Number(quantity);
  const earTags = useMemo(
    () => sequenceEarTags(prefix, first, Math.min(Number.isInteger(requested) ? requested : 0, room)),
    [prefix, first, requested, room]
  );
  const taken = useMemo(() => {
    const existing = new Set(existingEarTags);
    return earTags.filter((earTag) => existing.has(earTag));
  }, [earTags, existingEarTags]);

  const count = earTags.length;

  return (
    <>
      <div className="grid gap-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="sequence-prefix">Prefixo</Label>
            <Input
              id="sequence-prefix"
              value={prefix}
              onChange={(event) => setPrefix(event.target.value)}
              placeholder="BR-"
              autoFocus
              className="min-h-11 font-mono"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sequence-first">Primeiro nº</Label>
            <Input
              id="sequence-first"
              value={first}
              onChange={(event) => setFirst(event.target.value)}
              inputMode="numeric"
              placeholder="1001"
              className="min-h-11 font-mono"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sequence-quantity">Quantidade</Label>
            <Input
              id="sequence-quantity"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              inputMode="numeric"
              placeholder="40"
              className="min-h-11 font-mono"
            />
          </div>
        </div>
        <p className="-mt-2 text-xs text-ink-soft">Zeros à esquerda ficam: 0098, 0099, 0100.</p>

        {count > 0 ? (
          <div className="grid gap-2 rounded-lg border border-hairline bg-surface p-3">
            <p className="font-mono text-[11px] tracking-[0.04em] text-ink-soft uppercase">
              Prévia · {count} {count === 1 ? "linha" : "linhas"}
            </p>
            <p className="font-mono text-[13px] break-words text-ink">{previewText(earTags)}</p>
            {taken.length > 0 ? (
              <p className="flex gap-1.5 text-xs text-attention">
                <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                <span>
                  {nameTags(taken)} {taken.length === 1 ? "já existe" : "já existem"} no rebanho.{" "}
                  {taken.length === 1
                    ? "Essa linha entra marcada para você corrigir."
                    : "Essas linhas entram marcadas para você corrigir."}
                </span>
              </p>
            ) : null}
          </div>
        ) : null}

        {Number.isInteger(requested) && requested > room ? (
          <p className="text-xs text-attention">
            {room === 0
              ? "A lista já está cheia."
              : `Cabem mais ${room} ${room === 1 ? "linha" : "linhas"} nesta lista.`}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11">
            Cancelar
          </Button>
        </DialogClose>
        <Button
          type="button"
          className="min-h-11"
          disabled={count === 0}
          onClick={() => onAdd(earTags)}
        >
          {count === 0 ? "Adicionar linhas" : `Adicionar ${count} ${count === 1 ? "linha" : "linhas"}`}
        </Button>
      </DialogFooter>
    </>
  );
}

export function EarTagSequenceDialog({ open, onOpenChange, ...form }: EarTagSequenceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gerar sequência de brincos</DialogTitle>
          <DialogDescription>Cria uma linha por brinco, já com o padrão do grupo.</DialogDescription>
        </DialogHeader>
        <SequenceForm {...form} />
      </DialogContent>
    </Dialog>
  );
}
