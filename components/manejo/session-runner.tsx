"use client";

/**
 * Manejo session screen: the digital chute line. One animal is in focus at a
 * time (the brete); the operator records weight/note and taps "Concluir" or
 * "Pular", and the next pending animal takes the focus. Every action applies
 * its effects immediately (treatment, weighing), so the session can stop and
 * resume at any point without losing work — a manejo takes hours.
 */
import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ClipboardX, Percent, Search, Undo2 } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import type { ManejoSession, ManejoSessionAnimal } from "@/lib/types";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { CATEGORY_LABEL } from "@/lib/domain/labels";
import {
  carcassArrobas,
  currentWeight,
  DEFAULT_CARCASS_YIELD_PCT,
} from "@/lib/domain/weights";
import { formatArroba, formatCurrency, formatKg, formatPercent } from "@/lib/domain/format";
import { saleAmount } from "@/lib/domain/movements";
import { EntryChuteForm } from "@/components/manejo/entry-chute-form";
import { SaleSummaryCard } from "@/components/manejo/sale-summary";
import { SaleYieldDialog } from "@/components/manejo/sale-yield-dialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { ManejoProgressBar } from "@/components/manejo/progress-bar";
import { ManejoTypePill } from "@/components/manejo/manejo-type-pill";
import { sessionKind, sessionProgress } from "@/components/manejo/helpers";
import { cn } from "@/lib/utils";

interface ManejoSessionRunnerProps {
  sessionId: string;
}

/** Subtitle line of a session that moves the herd: where to, for how much. */
function movementSubtitle(session: ManejoSession, lotName: string | undefined): string {
  if (session.kind === "transfer") {
    return lotName ? `Destino: ${lotName}` : "Troca de lote";
  }
  const who = session.counterparty ? ` · ${session.counterparty}` : "";
  if (session.kind === "sale") {
    const price =
      session.pricePerArroba !== undefined
        ? `${formatCurrency(session.pricePerArroba)}/@${
            session.carcassYieldPct !== undefined
              ? ` · rend. ${formatPercent(session.carcassYieldPct)}`
              : ""
          }`
        : session.totalAmountBrl !== undefined
          ? `${formatCurrency(session.totalAmountBrl)} pelo lote`
          : "sem preço";
    return `Venda · ${price}${who}`;
  }
  const total =
    session.totalAmountBrl !== undefined ? formatCurrency(session.totalAmountBrl) : "sem valor";
  return `Compra · ${total}${lotName ? ` · entra em ${lotName}` : ""}${who}`;
}

export function ManejoSessionRunner({ sessionId }: ManejoSessionRunnerProps) {
  const session = useHerdStore((s) => s.manejoSessions.find((m) => m.id === sessionId));
  const animals = useHerdStore((s) => s.animals);
  const lots = useHerdStore((s) => s.lots);
  const completeManejoAnimal = useHerdStore((s) => s.completeManejoAnimal);
  const skipManejoAnimal = useHerdStore((s) => s.skipManejoAnimal);
  const reopenManejoAnimal = useHerdStore((s) => s.reopenManejoAnimal);
  const closeManejoSession = useHerdStore((s) => s.closeManejoSession);
  const { addToast } = useToast();

  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** True while a pass is in flight — a chute action must not double-fire. */
  const [busy, setBusy] = useState(false);
  /** Rendimento modal: null = auto (opens while the venda has no yield). */
  const [yieldDialogOpen, setYieldDialogOpen] = useState<boolean | null>(null);

  const byTag = useMemo(() => new Map(animals.map((a) => [a.earTag, a])), [animals]);

  if (!session) {
    return (
      <SectionCard title="Manejo não encontrado">
        <EmptyState
          icon={ClipboardX}
          title="Sessão inexistente"
          description="Este manejo não existe ou ainda não foi carregado."
        />
        <Link
          href="/manejo"
          className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Voltar ao manejo
        </Link>
      </SectionCard>
    );
  }

  const open = session.status === "open";
  const progress = sessionProgress(session);
  const pending = session.animals.filter((a) => a.outcome === "pending");
  const done = session.animals.filter((a) => a.outcome === "done");
  const skipped = session.animals.filter((a) => a.outcome === "skipped");

  const isEntry = session.kind === "entry";
  const isSale = session.kind === "sale";
  const destinationName = lots.find((l) => l.id === session.destinationLotId)?.name;
  // A venda per arroba pays the carcass: its chute stays held until the modal
  // collects the rendimento the R$/@ applies to.
  const perArroba = isSale && session.pricePerArroba !== undefined;
  const needsYield = open && perArroba && session.carcassYieldPct === undefined;
  // Live value of the animal on the scale, in a venda priced per arroba.
  const typedWeight = Number(weight);
  const passWeight =
    weight.trim() === "" || !Number.isFinite(typedWeight) || typedWeight <= 0
      ? null
      : typedWeight;
  const passValue =
    isSale && session.pricePerArroba !== undefined && passWeight !== null
      ? saleAmount(passWeight, session.pricePerArroba, session.carcassYieldPct)
      : null;

  const term = search.trim().toLowerCase();
  const visiblePending =
    term === "" ? pending : pending.filter((a) => a.earTag.toLowerCase().includes(term));

  // The animal at the chute: the tapped one, else the first (filtered) pending.
  const current =
    (selectedTag && pending.find((a) => a.earTag === selectedTag)) || visiblePending[0] || null;
  const currentAnimal = current ? byTag.get(current.earTag) : undefined;

  function resetPassForm() {
    setWeight("");
    setNote("");
    setError(null);
    setSelectedTag(null);
    setSearch("");
  }

  async function onComplete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !current || busy) return;
    let weightKg: number | undefined;
    if (session.weighing) {
      weightKg = Number(weight);
      if (weight.trim() === "" || !Number.isFinite(weightKg) || weightKg <= 0) {
        setError("Informe o peso (kg) do animal na balança.");
        return;
      }
    }
    setBusy(true);
    try {
      await completeManejoAnimal(session.id, current.earTag, {
        weightKg,
        notes: note.trim() === "" ? undefined : note.trim(),
      });
      resetPassForm();
    } finally {
      setBusy(false);
    }
  }

  async function onSkip() {
    if (!session || !current || busy) return;
    setBusy(true);
    try {
      await skipManejoAnimal(
        session.id,
        current.earTag,
        note.trim() === "" ? undefined : note.trim()
      );
      resetPassForm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={session.name}
        subtitle={
          session.kind === "health" || session.kind === "weighing"
            ? `Manejo de ${formatDate(session.date)}${
                session.treatment?.dose ? ` · ${session.treatment.dose}` : ""
              }${session.treatment?.responsible ? ` · ${session.treatment.responsible}` : ""}`
            : `${formatDate(session.date)} · ${movementSubtitle(session, destinationName)}`
        }
        actions={
          <Link
            href="/manejo"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Voltar
          </Link>
        }
      />

      <SectionCard
        title="Andamento"
        action={<ManejoTypePill action={sessionKind(session)} />}
      >
        <ManejoProgressBar progress={progress} />
        {!open ? (
          <p className="mt-2 text-xs text-ink-soft">
            Manejo encerrado
            {progress.pending > 0
              ? ` com ${progress.pending} ${progress.pending === 1 ? "animal pendente" : "animais pendentes"}.`
              : "."}
          </p>
        ) : null}
      </SectionCard>

      {perArroba && session.pricePerArroba !== undefined ? (
        <SaleYieldDialog
          key={session.carcassYieldPct ?? "unset"}
          sessionId={session.id}
          pricePerArroba={session.pricePerArroba}
          carcassYieldPct={session.carcassYieldPct}
          open={yieldDialogOpen ?? needsYield}
          onOpenChange={setYieldDialogOpen}
        />
      ) : null}

      {open && isEntry ? <EntryChuteForm session={session} todayIso={todayISO()} /> : null}

      {needsYield ? (
        <SectionCard title="No brete agora">
          <EmptyState
            icon={Percent}
            title="Defina o rendimento de carcaça"
            description="O valor de cada animal sai do rendimento combinado com o comprador — informe-o para liberar o brete."
          />
          <Button className="mt-3 min-h-11" onClick={() => setYieldDialogOpen(true)}>
            Informar rendimento
          </Button>
        </SectionCard>
      ) : null}

      {open && !isEntry && !needsYield && current ? (
        <SectionCard title="No brete agora">
          <form onSubmit={onComplete} className="space-y-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-3xl font-semibold text-ink">
                {current.earTag}
              </span>
              {currentAnimal ? (
                <span className="text-sm text-ink-soft">
                  {CATEGORY_LABEL[currentAnimal.category]}
                  {" · último peso: "}
                  {(() => {
                    const last = currentWeight(currentAnimal);
                    return last === null ? "sem pesagem" : formatKg(last);
                  })()}
                </span>
              ) : null}
            </div>

            {session.kind === "transfer" && destinationName ? (
              <p className="text-sm text-ink-soft">
                Ao concluir, o animal passa a ocupar{" "}
                <span className="font-medium text-ink">{destinationName}</span>.
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              {session.weighing ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="pass-weight">Peso na balança (kg)</Label>
                  <Input
                    key={current.earTag}
                    id="pass-weight"
                    type="number"
                    min={1}
                    step="0.1"
                    inputMode="decimal"
                    autoFocus
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="kg"
                    aria-invalid={error ? true : undefined}
                    className="min-h-11 font-mono text-lg"
                  />
                </div>
              ) : null}
              <div className={cn("grid gap-1.5", !session.weighing && "sm:col-span-2")}>
                <Label htmlFor="pass-note">Observação (opcional)</Label>
                <Input
                  id="pass-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ex.: reação, brinco danificado…"
                  className="min-h-11"
                />
              </div>
            </div>

            {isSale && session.pricePerArroba !== undefined ? (
              <p className="text-sm text-ink-soft">
                {passWeight === null ? (
                  "Digite o peso para calcular o valor deste animal."
                ) : (
                  <>
                    {formatArroba(
                      carcassArrobas(
                        passWeight,
                        session.carcassYieldPct ?? DEFAULT_CARCASS_YIELD_PCT
                      )
                    )}{" "}
                    de carcaça (rend.{" "}
                    {formatPercent(session.carcassYieldPct ?? DEFAULT_CARCASS_YIELD_PCT)}) ×{" "}
                    {formatCurrency(session.pricePerArroba)}/@ ={" "}
                    <span className="font-mono font-medium text-ink">
                      {formatCurrency(passValue ?? 0)}
                    </span>
                  </>
                )}
              </p>
            ) : null}
            {error ? <p className="text-xs text-overdue">{error}</p> : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={busy}
                className="min-h-12 flex-1 sm:flex-none sm:px-8"
              >
                <CheckCircle2 aria-hidden />
                Concluir animal
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-12"
                disabled={busy}
                onClick={onSkip}
              >
                Pular (não passou)
              </Button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {open && !isEntry && !current && pending.length === 0 ? (
        <SectionCard title="No brete agora">
          <EmptyState
            icon={CheckCircle2}
            title="Todos os animais manejados"
            description="Revise os pulados abaixo, se houver, e encerre o manejo."
          />
        </SectionCard>
      ) : null}

      {isSale ? (
        <SaleSummaryCard
          session={session}
          onEditYield={
            open && perArroba ? () => setYieldDialogOpen(true) : undefined
          }
        />
      ) : null}

      <div
        className={cn("grid items-start gap-4", !isEntry && "lg:grid-cols-2")}
      >
        {isEntry ? null : (
        <SectionCard title={`Pendentes (${pending.length})`}>
          {open ? (
            <div className="relative mb-2">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar brinco na fila"
                aria-label="Buscar animal pendente por brinco"
                className="min-h-11 pl-9 font-mono md:min-h-9"
              />
            </div>
          ) : null}
          {visiblePending.length === 0 ? (
            <p className="py-1 text-xs text-ink-soft">
              {pending.length === 0 ? "Nenhum animal pendente." : "Nenhum brinco corresponde à busca."}
            </p>
          ) : (
            <ul className="-my-1 max-h-72 divide-y divide-hairline overflow-y-auto">
              {visiblePending.map((entry) => {
                const animal = byTag.get(entry.earTag);
                const isCurrent = current?.earTag === entry.earTag;
                return (
                  <li key={entry.earTag}>
                    <button
                      type="button"
                      disabled={!open}
                      onClick={() => {
                        setSelectedTag(entry.earTag);
                        setError(null);
                      }}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-2 rounded-md px-1 py-2 text-left transition-colors hover:bg-surface",
                        isCurrent && "bg-brand-soft"
                      )}
                    >
                      <span className="font-mono text-sm font-medium text-ink">
                        {entry.earTag}
                      </span>
                      {animal ? (
                        <span className="text-xs text-ink-soft">
                          {CATEGORY_LABEL[animal.category]}
                        </span>
                      ) : null}
                      {isCurrent ? (
                        <span className="ml-auto text-xs font-medium text-brand">no brete</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
        )}

        <div className="space-y-4">
          <SectionCard title={`${isEntry ? "Registrados" : "Manejados"} (${done.length})`}>
            {done.length === 0 ? (
              <p className="py-1 text-xs text-ink-soft">
                {isEntry
                  ? "Nenhum animal registrado ainda."
                  : "Nenhum animal manejado ainda."}
              </p>
            ) : (
              <HandledList
                entries={done}
                open={open}
                onUndo={(earTag) => reopenManejoAnimal(session.id, earTag)}
              />
            )}
          </SectionCard>

          {skipped.length > 0 ? (
            <SectionCard title={`Pulados (${skipped.length})`}>
              <HandledList
                entries={skipped}
                open={open}
                onUndo={(earTag) => reopenManejoAnimal(session.id, earTag)}
              />
            </SectionCard>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="flex justify-end">
          <Button
            variant="outline"
            className="min-h-11"
            onClick={async () => {
              await closeManejoSession(session.id);
              addToast({ messageType: "success", text: "Manejo encerrado" });
            }}
          >
            {progress.pending > 0
              ? `Encerrar com ${progress.pending} ${progress.pending === 1 ? "pendente" : "pendentes"}`
              : "Encerrar manejo"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Rows of done/skipped animals with the recorded weight/note and undo. */
function HandledList({
  entries,
  open,
  onUndo,
}: {
  entries: ManejoSessionAnimal[];
  open: boolean;
  onUndo: (earTag: string) => void;
}) {
  return (
    <ul className="-my-1 max-h-72 divide-y divide-hairline overflow-y-auto">
      {entries.map((entry) => (
        <li key={entry.earTag} className="flex min-h-11 items-center gap-2 px-1 py-2">
          <span className="font-mono text-sm font-medium text-ink">{entry.earTag}</span>
          {entry.weightKg !== undefined ? (
            <span className="font-mono text-xs text-ink-soft">{formatKg(entry.weightKg)}</span>
          ) : null}
          {entry.amountBrl !== undefined ? (
            <span className="font-mono text-xs text-ink">{formatCurrency(entry.amountBrl)}</span>
          ) : null}
          {entry.notes ? (
            <span className="truncate text-xs text-ink-soft">{entry.notes}</span>
          ) : null}
          {open ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto min-h-11 text-brand md:min-h-0"
              onClick={() => onUndo(entry.earTag)}
              aria-label={`Desfazer o manejo do animal ${entry.earTag}`}
            >
              <Undo2 aria-hidden />
              Desfazer
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
