"use client";

import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { lotsWithSummary } from "@/lib/store/selectors";
import { formatNumber } from "@/lib/domain/format";
import { useTemporaryMessage } from "./useTemporaryMessage";

/** Formats hectares without an unnecessary decimal (42 -> "42"; 12.5 -> "12,5"). */
function formatHectares(hectares: number): string {
  return formatNumber(hectares, Number.isInteger(hectares) ? 0 : 1);
}

/** Table of lots/paddocks with live count, removal, and an add row. */
export function LotsPaddocks() {
  const lots = useHerdStore((s) => s.lots);
  const animals = useHerdStore((s) => s.animals);
  const addLot = useHerdStore((s) => s.addLot);
  const removeLot = useHerdStore((s) => s.removeLot);
  const [removeError, showRemoveError] = useTemporaryMessage(3000);
  const [name, setName] = useState("");
  const [grass, setGrass] = useState("");
  const [hectares, setHectares] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const summaries = lotsWithSummary(lots, animals);

  async function onRemove(id: string) {
    if (!(await removeLot(id))) {
      showRemoveError("Lote com animais — transfira antes de remover");
    }
  }

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanGrass = grass.trim();
    const hectaresNumber = Number(hectares.replace(",", "."));
    if (cleanName === "") {
      setFormError("Informe o nome do lote.");
      return;
    }
    if (cleanGrass === "") {
      setFormError("Informe o capim do lote.");
      return;
    }
    if (!Number.isFinite(hectaresNumber) || hectaresNumber <= 0) {
      setFormError("Hectares deve ser um número maior que zero.");
      return;
    }
    addLot({ name: cleanName, grass: cleanGrass, hectares: hectaresNumber });
    setName("");
    setGrass("");
    setHectares("");
    setFormError(null);
  }

  return (
    <SectionCard title="Lotes">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Capim</TableHead>
            <TableHead className="text-right">Hectares</TableHead>
            <TableHead className="text-right">Cabeças</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {summaries.map(({ lot, headCount }) => (
            <TableRow key={lot.id}>
              <TableCell className="font-medium">{lot.name}</TableCell>
              <TableCell className="text-ink-soft">{lot.grass}</TableCell>
              <TableCell className="text-right font-mono">
                {formatHectares(lot.hectares)}
              </TableCell>
              <TableCell className="text-right font-mono">{formatNumber(headCount)}</TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onRemove(lot.id)}
                  aria-label={`Remover lote ${lot.name}`}
                  className="min-h-11 min-w-11 text-ink-soft hover:text-overdue md:min-h-7 md:min-w-7"
                >
                  <Trash2 aria-hidden />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {removeError ? <p className="mt-3 text-sm text-overdue">{removeError}</p> : null}
      <form
        onSubmit={onAdd}
        className="mt-4 flex flex-col gap-2 border-t border-hairline pt-4 sm:flex-row"
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do lote"
          aria-label="Nome do novo lote"
        />
        <Input
          value={grass}
          onChange={(e) => setGrass(e.target.value)}
          placeholder="Capim"
          aria-label="Capim do novo lote"
        />
        <Input
          value={hectares}
          onChange={(e) => setHectares(e.target.value)}
          placeholder="Hectares"
          aria-label="Hectares do novo lote"
          type="number"
          min={0}
          step="0.1"
          inputMode="decimal"
          className="font-mono sm:max-w-28"
        />
        <Button type="submit" variant="outline" className="min-h-11 md:min-h-0">
          Adicionar
        </Button>
      </form>
      {formError ? <p className="mt-2 text-sm text-overdue">{formError}</p> : null}
    </SectionCard>
  );
}
