"use client";

/**
 * "Lote da planilha": the caderno's lote values that matched no lot of the
 * farm, each with one picker. A pick covers every line carrying that value, so
 * forty bezerros in lote "2" cost one choice, not forty.
 *
 * Values that matched on their own ("2" against "Lote 2") never show here.
 */
import { ArrowRight, TriangleAlert } from "lucide-react";
import type { BirthLotValue, LotPicks } from "@/lib/domain/birthImport";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** A lot currently placed in an invernada, labelled "Nome · Inv. código". */
export interface LotOption {
  id: string;
  label: string;
}

interface BirthImportLotsProps {
  values: BirthLotValue[];
  picks: LotPicks;
  lots: LotOption[];
  onPick: (key: string, lotId: string) => void;
}

export function BirthImportLots({ values, picks, lots, onPick }: BirthImportLotsProps) {
  const pending = values.filter((value) => !value.lotId);
  if (pending.length === 0) return null;

  const waiting = pending.some((value) => !picks[value.key]);
  const hint =
    pending.length === 1
      ? `Nenhum lote do MeuBov se chama “${pending[0].label}”. Escolha onde esses bezerros entram; vale para todas as linhas.`
      : "Nenhum lote do MeuBov tem esses nomes. Escolha onde esses bezerros entram; vale para todas as linhas.";

  return (
    <div
      className={cn(
        "grid gap-3 rounded-lg border px-4 py-3",
        waiting ? "border-attention/45 bg-attention-soft/45" : "border-hairline bg-panel"
      )}
    >
      <div className="grid gap-0.5">
        <p className="text-sm font-medium text-ink">Lote da planilha</p>
        <p className="text-xs text-pretty text-ink-soft">{hint}</p>
      </div>

      <ul className="grid gap-3">
        {pending.map((value) => {
          const picked = picks[value.key];
          return (
            <li
              key={value.key}
              className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-7 min-w-8 items-center justify-center rounded-md border border-hairline bg-surface px-2 font-mono text-sm font-medium text-ink">
                  {value.label}
                </span>
                <span className="text-sm text-ink-soft">
                  {value.lines} {value.lines === 1 ? "linha" : "linhas"}
                </span>
                <ArrowRight aria-hidden className="hidden size-4 text-ink-soft sm:block" />
              </div>
              <Select value={picked} onValueChange={(lotId) => onPick(value.key, lotId)}>
                <SelectTrigger
                  aria-label={`Lote para “${value.label}”`}
                  className={cn(
                    "min-h-11 w-full bg-panel sm:w-[300px]",
                    !picked && "border-attention ring-3 ring-attention/20"
                  )}
                >
                  <SelectValue placeholder="Selecione o lote" />
                </SelectTrigger>
                <SelectContent>
                  {lots.map((lot) => (
                    <SelectItem key={lot.id} value={lot.id}>
                      {lot.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          );
        })}
      </ul>

      {waiting ? (
        <p className="flex items-center gap-1.5 text-xs text-attention">
          <TriangleAlert aria-hidden className="size-3.5" />
          Escolha o lote para liberar a importação.
        </p>
      ) : null}
    </div>
  );
}
