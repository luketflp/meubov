"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Fence, MapPinPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
import { useCan } from "@/lib/store/usePermissions";
import { invernadasWithSummary } from "@/lib/store/selectors";
import { formatNumber } from "@/lib/domain/format";
import { stepHref } from "@/lib/domain/mapSetup";
import type { Invernada } from "@/lib/types";
import { RemoveInvernadaDialog } from "./remove-invernada-dialog";

/** Formats hectares without an unnecessary decimal (42 -> "42"; 12.5 -> "12,5"). */
function formatHectares(hectares: number): string {
  return formatNumber(hectares, Number.isInteger(hectares) ? 0 : 1);
}

/** The Invernadas card's anchor: Primeiros passos scrolls here. */
export const INVERNADAS_SECTION_ID = "invernadas";

/** The new invernada's Código, focused by Primeiros passos and again after each add. */
export const NEW_INVERNADA_CODE_ID = "invernada-nova-codigo";

/** "Vazia", or the lotes grazing there now. */
function currentLotsLabel(lots: { name: string }[]): string {
  return lots.length === 0 ? "Vazia" : lots.map((lot) => lot.name).join(", ");
}

/** "Sem contorno · Desenhar no mapa", under an invernada with no outline yet. */
function DrawOnMapHint({ invernada }: { invernada: Invernada }) {
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-ink-soft">
      Sem contorno ·
      <Link
        href={stepHref({ kind: "invernada", invernadaId: invernada.id })}
        className="inline-flex min-h-11 items-center gap-1 font-medium text-brand hover:underline lg:min-h-0"
      >
        <MapPinPlus aria-hidden className="size-[13px]" />
        Desenhar no mapa
      </Link>
    </span>
  );
}

/** Editar and Remover, on the table's row and on the phone's card. */
function InvernadaActions({
  invernada,
  onRemove,
}: {
  invernada: Invernada;
  onRemove: (invernada: Invernada) => void;
}) {
  return (
    <div className="flex justify-end">
      <EditInvernadaDialog invernada={invernada} />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onRemove(invernada)}
        aria-label={`Remover invernada ${invernada.code}`}
        className="min-h-11 min-w-11 text-ink-soft hover:text-overdue lg:min-h-7 lg:min-w-7"
      >
        <Trash2 aria-hidden />
      </Button>
    </div>
  );
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

/**
 * Fixed farm areas with their current logical lots, removal, and the Nova
 * invernada form. Editing, removal, the form and the "Desenhar no mapa" link
 * belong to whoever may edit Lotes e Mapa; anyone else reads the table, which
 * then has no Ações column.
 */
export function InvernadasSettings() {
  const invernadas = useHerdStore((s) => s.invernadas);
  const lots = useHerdStore((s) => s.lots);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const animals = useHerdStore((s) => s.animals);
  const addInvernada = useHerdStore((s) => s.addInvernada);
  const canEditLots = useCan("lots", "edit");
  const [removing, setRemoving] = useState<Invernada | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [grass, setGrass] = useState("");
  const [hectares, setHectares] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);

  const summaries = invernadasWithSummary(
    invernadas,
    lots,
    lotPlacements,
    animals
  );

  function onRemove(invernada: Invernada) {
    setRemoving(invernada);
  }
  const removingLots =
    summaries.find((summary) => summary.invernada.id === removing?.id)?.lots ?? [];

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
      codeInput.current?.focus();
    } catch {
      setFormError("Não foi possível criar a invernada. Confira se o código já existe.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <SectionCard id={INVERNADAS_SECTION_ID} title="Invernadas" className="scroll-mt-6">
      <p className="mb-4 text-sm text-ink-soft">
        A invernada é uma área física fixa da fazenda. Seu código permanece o
        mesmo quando os lotes de animais mudam de lugar.
      </p>
      {summaries.length === 0 ? (
        <EmptyState
          icon={Fence}
          title="Nenhuma invernada ainda"
          description={
            canEditLots
              ? "Cadastre cada pasto abaixo, com o código que a equipe usa no campo."
              : "As invernadas da fazenda aparecem aqui quando forem cadastradas."
          }
          className="py-7"
        />
      ) : (
        <>
          {/* Wide screens: the table. Its cells wrap, so it fits the card without a sideways scroll. */}
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Capim</TableHead>
                  <TableHead className="text-right">Hectares</TableHead>
                  <TableHead>Lotes atuais</TableHead>
                  <TableHead className="text-right">Cabeças</TableHead>
                  {canEditLots ? (
                    <TableHead className="w-16">
                      <span className="sr-only">Ações</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map(({ invernada, lots: currentLots, headCount }) => (
                  <TableRow key={invernada.id}>
                    <TableCell className="max-w-32 font-mono font-medium break-words whitespace-normal">
                      {invernada.code}
                    </TableCell>
                    <TableCell className="text-ink-soft whitespace-normal">
                      <span className="block">{invernada.name || "—"}</span>
                      {canEditLots && invernada.boundary === undefined ? (
                        <DrawOnMapHint invernada={invernada} />
                      ) : null}
                    </TableCell>
                    <TableCell className="text-ink-soft whitespace-normal">{invernada.grass}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatHectares(invernada.hectares)}
                    </TableCell>
                    <TableCell className="text-ink-soft whitespace-normal">
                      {currentLotsLabel(currentLots)}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(headCount)}</TableCell>
                    {canEditLots ? (
                      <TableCell className="text-right">
                        <InvernadaActions invernada={invernada} onRemove={onRemove} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Phone and tablet: one card per invernada; seven columns do not fit there. */}
          <ul className="grid gap-2 lg:hidden">
            {summaries.map(({ invernada, lots: currentLots, headCount }) => (
              <li key={invernada.id} className="rounded-lg border border-hairline px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-ink">
                      <span className="font-mono font-medium break-words">{invernada.code}</span>
                      {invernada.name ? <span className="text-ink-soft"> · {invernada.name}</span> : null}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {invernada.grass} · <span className="font-mono">{formatHectares(invernada.hectares)}</span> ha
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {currentLotsLabel(currentLots)} ·{" "}
                      <span className="font-mono">{formatNumber(headCount)}</span>{" "}
                      {headCount === 1 ? "cabeça" : "cabeças"}
                    </p>
                    {canEditLots && invernada.boundary === undefined ? (
                      <DrawOnMapHint invernada={invernada} />
                    ) : null}
                  </div>
                  {canEditLots ? (
                    <div className="-mt-1.5 -mr-2 shrink-0">
                      <InvernadaActions invernada={invernada} onRemove={onRemove} />
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <RemoveInvernadaDialog
        invernada={removing}
        currentLots={removingLots}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      />
      {canEditLots ? (
        <form onSubmit={onAdd} className="mt-4 border-t border-hairline pt-4">
          <p className="mb-3 text-sm font-medium text-ink">Nova invernada</p>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end sm:gap-2">
            <div className="grid gap-1.5 sm:w-24 sm:shrink-0">
              <Label htmlFor={NEW_INVERNADA_CODE_ID}>Código</Label>
              <Input
                id={NEW_INVERNADA_CODE_ID}
                ref={codeInput}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ex.: 03"
                className="min-h-11 font-mono md:min-h-0"
                autoCapitalize="characters"
              />
            </div>
            <div className="grid min-w-0 gap-1.5 sm:flex-1">
              <Label htmlFor="invernada-nova-nome">Nome (opcional)</Label>
              <Input
                id="invernada-nova-nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Sede"
                className="min-h-11 md:min-h-0"
              />
            </div>
            <div className="grid min-w-0 gap-1.5 sm:flex-1">
              <Label htmlFor="invernada-nova-capim">Capim</Label>
              <Input
                id="invernada-nova-capim"
                value={grass}
                onChange={(e) => setGrass(e.target.value)}
                placeholder="Ex.: Braquiária"
                className="min-h-11 md:min-h-0"
              />
            </div>
            <div className="grid gap-1.5 sm:w-24 sm:shrink-0">
              <Label htmlFor="invernada-nova-hectares">Hectares</Label>
              <Input
                id="invernada-nova-hectares"
                value={hectares}
                onChange={(e) => setHectares(e.target.value)}
                placeholder="0"
                type="number"
                min={0}
                step="0.1"
                inputMode="decimal"
                className="min-h-11 font-mono md:min-h-0"
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={adding}
              className="col-span-2 min-h-11 md:min-h-0"
            >
              <Plus aria-hidden />
              {adding ? "Adicionando…" : "Adicionar"}
            </Button>
          </div>
        </form>
      ) : null}
      {formError ? <p className="mt-2 text-sm text-overdue">{formError}</p> : null}
    </SectionCard>
  );
}
