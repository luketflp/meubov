"use client";

import { useState, type FormEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { invernadasWithSummary } from "@/lib/store/selectors";
import { formatNumber } from "@/lib/domain/format";
import type { Invernada } from "@/lib/types";
import { useTemporaryMessage } from "./useTemporaryMessage";

/** Formats hectares without an unnecessary decimal (42 -> "42"; 12.5 -> "12,5"). */
function formatHectares(hectares: number): string {
  return formatNumber(hectares, Number.isInteger(hectares) ? 0 : 1);
}

function EditInvernadaDialog({ invernada }: { invernada: Invernada }) {
  const updateInvernada = useHerdStore((s) => s.updateInvernada);
  const isProvisional = invernada.code.startsWith("LEGACY-");
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(invernada.code);
  const [name, setName] = useState(invernada.name ?? "");
  const [grass, setGrass] = useState(invernada.grass);
  const [hectares, setHectares] = useState(String(invernada.hectares));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function onOpenChange(next: boolean) {
    if (next) {
      setCode(invernada.code);
      setName(invernada.name ?? "");
      setGrass(invernada.grass);
      setHectares(String(invernada.hectares));
      setError(null);
    }
    setOpen(next);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanCode = code.trim();
    const cleanGrass = grass.trim();
    const hectaresNumber = Number(hectares.replace(",", "."));
    if (isProvisional && cleanCode === "") {
      setError("Informe o número ou código fixo da invernada.");
      return;
    }
    if (cleanGrass === "") {
      setError("Informe o capim da invernada.");
      return;
    }
    if (!Number.isFinite(hectaresNumber) || hectaresNumber <= 0) {
      setError("Hectares deve ser um número maior que zero.");
      return;
    }

    setSaving(true);
    try {
      await updateInvernada(invernada.id, {
        ...(isProvisional && cleanCode !== invernada.code
          ? { code: cleanCode }
          : {}),
        name: cleanName === "" ? null : cleanName,
        grass: cleanGrass,
        hectares: hectaresNumber,
      });
      setOpen(false);
    } catch {
      setError("Não foi possível salvar a invernada. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Editar invernada ${invernada.code}`}
          className="min-h-11 min-w-11 text-ink-soft md:min-h-7 md:min-w-7"
        >
          <Pencil aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar invernada {invernada.code}</DialogTitle>
          <DialogDescription>
            {isProvisional
              ? "Substitua o código provisório pelo número fixo desta área. Depois de salvo, ele não poderá ser alterado."
              : "O código identifica esta área física e permanece fixo. Você pode corrigir os demais dados abaixo."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          {isProvisional ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`invernada-${invernada.id}-code`}>
                Número ou código fixo
              </Label>
              <Input
                id={`invernada-${invernada.id}-code`}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Ex.: 03 ou 3A"
                className="min-h-11 font-mono"
                autoCapitalize="characters"
              />
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor={`invernada-${invernada.id}-name`}>Nome (opcional)</Label>
            <Input
              id={`invernada-${invernada.id}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Sede"
              className="min-h-11"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`invernada-${invernada.id}-grass`}>Capim</Label>
            <Input
              id={`invernada-${invernada.id}-grass`}
              value={grass}
              onChange={(event) => setGrass(event.target.value)}
              className="min-h-11"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`invernada-${invernada.id}-hectares`}>Hectares</Label>
            <Input
              id={`invernada-${invernada.id}-hectares`}
              value={hectares}
              onChange={(event) => setHectares(event.target.value)}
              type="number"
              min={0}
              step="0.1"
              inputMode="decimal"
              className="min-h-11 font-mono"
            />
          </div>
          {error ? <p className="text-xs text-overdue">{error}</p> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving} className="min-h-11">
              {saving ? "Salvando…" : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Fixed farm areas with their current logical lots, removal, and an add row. */
export function InvernadasSettings() {
  const invernadas = useHerdStore((s) => s.invernadas);
  const lots = useHerdStore((s) => s.lots);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const animals = useHerdStore((s) => s.animals);
  const addInvernada = useHerdStore((s) => s.addInvernada);
  const removeInvernada = useHerdStore((s) => s.removeInvernada);
  const [removeError, showRemoveError] = useTemporaryMessage(3000);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [grass, setGrass] = useState("");
  const [hectares, setHectares] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const summaries = invernadasWithSummary(
    invernadas,
    lots,
    lotPlacements,
    animals
  );

  async function onRemove(invernada: Invernada) {
    const label = `invernada ${invernada.code}${invernada.name ? ` · ${invernada.name}` : ""}`;
    if (
      !window.confirm(
        `Remover a ${label}? O cadastro e o contorno no mapa serão apagados permanentemente.`
      )
    ) {
      return;
    }
    if (!(await removeInvernada(invernada.id))) {
      showRemoveError("Invernada vinculada a lotes ou histórico — não pode ser removida");
    }
  }

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanCode = code.trim();
    const cleanName = name.trim();
    const cleanGrass = grass.trim();
    const hectaresNumber = Number(hectares.replace(",", "."));
    if (cleanCode === "") {
      setFormError("Informe o número ou código da invernada.");
      return;
    }
    if (cleanGrass === "") {
      setFormError("Informe o capim da invernada.");
      return;
    }
    if (!Number.isFinite(hectaresNumber) || hectaresNumber <= 0) {
      setFormError("Hectares deve ser um número maior que zero.");
      return;
    }
    setAdding(true);
    try {
      await addInvernada({
        code: cleanCode,
        ...(cleanName === "" ? {} : { name: cleanName }),
        grass: cleanGrass,
        hectares: hectaresNumber,
      });
      setCode("");
      setName("");
      setGrass("");
      setHectares("");
      setFormError(null);
    } catch {
      setFormError("Não foi possível criar a invernada. Confira se o código já existe.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <SectionCard title="Invernadas">
      <p className="mb-4 text-sm text-ink-soft">
        A invernada é uma área física fixa da fazenda. Seu código permanece o
        mesmo quando os lotes de animais mudam de lugar.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Capim</TableHead>
            <TableHead className="text-right">Hectares</TableHead>
            <TableHead>Lotes atuais</TableHead>
            <TableHead className="text-right">Cabeças</TableHead>
            <TableHead className="w-20">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {summaries.map(({ invernada, lots: currentLots, headCount }) => (
            <TableRow key={invernada.id}>
              <TableCell className="font-mono font-medium">{invernada.code}</TableCell>
              <TableCell className="text-ink-soft">{invernada.name || "—"}</TableCell>
              <TableCell className="text-ink-soft">{invernada.grass}</TableCell>
              <TableCell className="text-right font-mono">
                {formatHectares(invernada.hectares)}
              </TableCell>
              <TableCell className="max-w-52 text-ink-soft">
                {currentLots.length === 0
                  ? "Vazia"
                  : currentLots.map((lot) => lot.name).join(", ")}
              </TableCell>
              <TableCell className="text-right font-mono">{formatNumber(headCount)}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end">
                  <EditInvernadaDialog invernada={invernada} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onRemove(invernada)}
                    aria-label={`Remover invernada ${invernada.code}`}
                    className="min-h-11 min-w-11 text-ink-soft hover:text-overdue md:min-h-7 md:min-w-7"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
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
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Código"
          aria-label="Número ou código da nova invernada"
          className="font-mono sm:max-w-28"
          autoCapitalize="characters"
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome (opcional)"
          aria-label="Nome opcional da nova invernada"
        />
        <Input
          value={grass}
          onChange={(e) => setGrass(e.target.value)}
          placeholder="Capim"
          aria-label="Capim da nova invernada"
        />
        <Input
          value={hectares}
          onChange={(e) => setHectares(e.target.value)}
          placeholder="Hectares"
          aria-label="Hectares da nova invernada"
          type="number"
          min={0}
          step="0.1"
          inputMode="decimal"
          className="font-mono sm:max-w-28"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={adding}
          className="min-h-11 md:min-h-0"
        >
          {adding ? "Adicionando…" : "Adicionar"}
        </Button>
      </form>
      {formError ? <p className="mt-2 text-sm text-overdue">{formError}</p> : null}
    </SectionCard>
  );
}
