"use client";

/**
 * The ultrassom brete of one lote, opened by "Iniciar ultrassom" on the
 * Ultrassom tab: the manejo chute line for the vet. One cow is in focus at a
 * time; "Prenhe" or "Vazia" saves her diagnosis on the exam date and the next
 * waiting cow takes the focus, "Pular" sends her to the Puladas. Any cow of
 * the queue can be tapped into the brete, since the cows come in the order
 * they walk in. A diagnosed cow can go back to waiting, which clears her
 * result, and a skipped one back to the queue.
 *
 * The vet's observação ("gestação de ~60 dias") goes with the tap, on the
 * diagnosis, and shows on the Diagnosticadas row.
 *
 * The cows are the lote's waiting coberturas when the brete opened, so a cow
 * stays on screen once diagnosed; nothing else is saved about the exam, and
 * leaving the brete loses only which cows were skipped. Each tap goes through
 * the same store call as the tab.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CheckCircle2, Search, Stethoscope, Undo2, X } from "lucide-react";
import type { DiagnosisResult } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { CATEGORY_LABEL } from "@/lib/domain/labels";
import { isDiagnosed } from "@/lib/domain/reproduction";
import { breteRows, type UltrasoundGroup, type UltrasoundRow } from "@/lib/domain/ultrasound";
import { BreedingPill, ResultPill } from "@/components/animal/reproduction-pills";
import {
  BullName,
  daysText,
  examDateError,
  ExamDateField,
  ULTRASOUND_HREF,
} from "@/components/breedings/ultrasound-parts";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

interface UltrasoundBreteProps {
  /** The lote as the tab lists it now; null when none of its cows waits. */
  group: UltrasoundGroup | null;
  lotName: string;
  /** The tab's exam date, shared with the brete. */
  examDate: string;
  onExamDateChange: (value: string) => void;
}

/** Bar of the cows handled — diagnosed, then skipped — over the lote's cows. */
function BreteProgress({
  total,
  diagnosed,
  skipped,
}: {
  total: number;
  diagnosed: number;
  skipped: number;
}) {
  const pct = (count: number) => (total === 0 ? 0 : (count / total) * 100);
  const waiting = total - diagnosed - skipped;
  return (
    <div className="space-y-1">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={diagnosed}
        aria-label="Andamento do ultrassom"
        className="flex h-2 w-full overflow-hidden rounded-full bg-surface"
      >
        <div className="h-full bg-brand" style={{ width: `${pct(diagnosed)}%` }} />
        <div className="h-full bg-attention" style={{ width: `${pct(skipped)}%` }} />
      </div>
      <p className="text-xs text-ink-soft">
        <span className="font-mono font-medium text-ink">
          {diagnosed}/{total}
        </span>{" "}
        diagnosticadas
        {skipped > 0 ? ` · ${skipped} ${skipped === 1 ? "pulada" : "puladas"}` : ""}
        {waiting > 0 ? ` · ${waiting} na fila` : ""}
      </p>
    </div>
  );
}

/** What the brete says with no cow in it. */
function emptyBrete(waiting: number, skipped: number): { title: string; description: string } {
  if (waiting > 0) {
    return {
      title: "Nenhuma vaca na busca",
      description: "Nenhum brinco da fila corresponde à busca.",
    };
  }
  if (skipped > 0) {
    return {
      title: "Só restam as puladas",
      description: "Volte as puladas para a fila para examiná-las, ou volte à lista.",
    };
  }
  return {
    title: "Todas as vacas diagnosticadas",
    description: "O diagnóstico de cada vaca já está salvo.",
  };
}

function BackToList({ className }: { className?: string }) {
  return (
    <Link
      href={ULTRASOUND_HREF}
      scroll={false}
      className={cn(
        "inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0",
        className
      )}
    >
      <ArrowLeft className="size-4" aria-hidden />
      Voltar à lista
    </Link>
  );
}

export function UltrasoundBrete({
  group,
  lotName,
  examDate,
  onExamDateChange,
}: UltrasoundBreteProps) {
  const animals = useHerdStore((s) => s.animals);
  const semenBulls = useHerdStore((s) => s.semenBulls);
  const recordDiagnosis = useHerdStore((s) => s.recordDiagnosis);
  const clearDiagnosis = useHerdStore((s) => s.clearDiagnosis);
  const today = todayISO();

  // The lote's waiting cows when the brete opened, in the tab's order.
  const [breedingIds] = useState(
    () => group?.rows.filter((row) => row.result === "pending").map((row) => row.breeding.id) ?? []
  );
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  /** The observação typed for the cow in the brete; it goes with her tap. */
  const [note, setNote] = useState("");
  /** True while a tap saves — a brete action must not double-fire. */
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () => breteRows(breedingIds, animals, semenBulls, today),
    [breedingIds, animals, semenBulls, today]
  );
  const diagnosed = rows.filter((row) => isDiagnosed(row.result));
  const waiting = rows.filter((row) => !isDiagnosed(row.result) && !skipped.has(row.breeding.id));
  const skippedRows = rows.filter(
    (row) => !isDiagnosed(row.result) && skipped.has(row.breeding.id)
  );

  const term = search.trim().toLowerCase();
  const visibleWaiting =
    term === "" ? waiting : waiting.filter((row) => row.dam.earTag.toLowerCase().includes(term));
  // The cow in the brete: the tapped one, else the first (filtered) in the queue.
  const current =
    waiting.find((row) => row.breeding.id === selectedId) ?? visibleWaiting[0] ?? null;

  const dateError = examDateError(examDate, today);
  const tooEarly = current !== null && dateError === null && current.breeding.date > examDate;
  const blocked = busy || dateError !== null || tooEarly;

  function nextCow() {
    setSelectedId(null);
    setSearch("");
    setNote("");
  }

  async function diagnose(result: Exclude<DiagnosisResult, "pending">) {
    if (current === null || blocked) return;
    setBusy(true);
    try {
      await recordDiagnosis(current.dam.earTag, {
        breedingId: current.breeding.id,
        result,
        date: examDate,
        notes: note.trim() === "" ? undefined : note.trim(),
      });
      nextCow();
    } catch {
      // The store already showed the failure; the cow stays in the brete.
    } finally {
      setBusy(false);
    }
  }

  function skip() {
    if (current === null || busy) return;
    setSkipped((previous) => new Set(previous).add(current.breeding.id));
    nextCow();
  }

  async function backToWaiting(row: UltrasoundRow) {
    if (busy) return;
    setBusy(true);
    try {
      await clearDiagnosis(row.dam.earTag, row.breeding.id);
    } catch {
      // The store already showed the failure.
    } finally {
      setBusy(false);
    }
  }

  function backToQueue(row: UltrasoundRow) {
    setSkipped((previous) => {
      const next = new Set(previous);
      next.delete(row.breeding.id);
      return next;
    });
  }

  const header = (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
      <div className="min-w-0">
        <BackToList />
        <h2 className="font-heading text-lg font-semibold text-ink">Ultrassom · {lotName}</h2>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <ExamDateField
          id="ultrasound-brete-exam-date"
          value={examDate}
          todayIso={today}
          onChange={onExamDateChange}
        />
      </div>
    </div>
  );

  if (breedingIds.length === 0) {
    return (
      <div className="space-y-6">
        <div className="min-w-0">
          <BackToList />
          <h2 className="font-heading text-lg font-semibold text-ink">Ultrassom · {lotName}</h2>
        </div>
        <section className="rounded-lg border border-hairline bg-panel">
          <EmptyState
            icon={Stethoscope}
            title="Nenhuma vaca aguardando diagnóstico"
            description="Este lote não tem cobertura esperando o ultrassom."
          />
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <SectionCard title="Andamento">
        <BreteProgress
          total={rows.length}
          diagnosed={diagnosed.length}
          skipped={skippedRows.length}
        />
      </SectionCard>

      {current ? (
        <SectionCard title="No brete agora">
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-3xl font-semibold text-ink">
                {current.dam.earTag}
              </span>
              <span className="text-sm text-ink-soft">
                {CATEGORY_LABEL[current.dam.category]}
                {" · "}
                {current.dam.breed.trim() === "" ? "sem raça" : current.dam.breed}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-soft">
              <BreedingPill type={current.breeding.type} />
              <span>
                Cobertura em{" "}
                <span className="font-mono text-ink">{formatDate(current.breeding.date)}</span> ·{" "}
                {daysText(current.days)}
              </span>
              <span>
                Touro <BullName row={current} className="font-medium" />
              </span>
            </div>
            {tooEarly ? (
              <p className="text-xs text-overdue">
                A cobertura é depois da data do exame — ajuste a data para diagnosticar.
              </p>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="ultrasound-note">Observação (opcional)</Label>
              <Input
                id="ultrasound-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex.: gestação de ~60 dias, cisto no ovário…"
                className="min-h-11"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button
                type="button"
                variant="outline"
                className="min-h-12 text-healthy hover:text-healthy sm:px-8"
                disabled={blocked}
                onClick={() => void diagnose("pregnant")}
              >
                <Check aria-hidden />
                Prenhe
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-12 text-ink-soft hover:text-ink sm:px-8"
                disabled={blocked}
                onClick={() => void diagnose("open")}
              >
                <X aria-hidden />
                Vazia
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="col-span-2 min-h-12 text-ink-soft"
                disabled={busy}
                onClick={skip}
              >
                Pular (não passou)
              </Button>
            </div>
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="No brete agora">
          <EmptyState icon={CheckCircle2} {...emptyBrete(waiting.length, skippedRows.length)} />
          <div className="flex justify-center">
            <Button asChild variant="outline" className="min-h-11">
              <Link href={ULTRASOUND_HREF} scroll={false}>
                Voltar à lista
              </Link>
            </Button>
          </div>
        </SectionCard>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <SectionCard title={`Na fila (${waiting.length})`}>
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
              aria-label="Buscar vaca na fila por brinco"
              className="min-h-11 pl-9 font-mono md:min-h-9"
            />
          </div>
          {visibleWaiting.length === 0 ? (
            <p className="py-1 text-xs text-ink-soft">
              {waiting.length === 0 ? "Nenhuma vaca na fila." : "Nenhum brinco corresponde à busca."}
            </p>
          ) : (
            <ul className="-my-1 max-h-72 divide-y divide-hairline overflow-y-auto">
              {visibleWaiting.map((row) => {
                const isCurrent = current?.breeding.id === row.breeding.id;
                return (
                  <li key={row.breeding.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(row.breeding.id);
                        setNote("");
                      }}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-2 rounded-md px-1 py-2 text-left transition-colors hover:bg-surface",
                        isCurrent && "bg-brand-soft"
                      )}
                    >
                      <span className="font-mono text-sm font-medium text-ink">
                        {row.dam.earTag}
                      </span>
                      <span className="text-xs text-ink-soft">{daysText(row.days)}</span>
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

        <div className="space-y-4">
          <SectionCard title={`Diagnosticadas (${diagnosed.length})`}>
            {diagnosed.length === 0 ? (
              <p className="py-1 text-xs text-ink-soft">Nenhuma vaca diagnosticada ainda.</p>
            ) : (
              <ul className="-my-1 max-h-72 divide-y divide-hairline overflow-y-auto">
                {diagnosed.map((row) => (
                  <li key={row.breeding.id} className="flex min-h-11 items-center gap-2 px-1 py-2">
                    <span className="font-mono text-sm font-medium text-ink">{row.dam.earTag}</span>
                    <ResultPill result={row.result} />
                    {row.notes ? (
                      <span className="truncate text-xs text-ink-soft">{row.notes}</span>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto min-h-11 text-brand md:min-h-0"
                      disabled={busy}
                      onClick={() => void backToWaiting(row)}
                      aria-label={`Voltar a vaca ${row.dam.earTag} para aguardando diagnóstico`}
                    >
                      <Undo2 aria-hidden />
                      Voltar a pendente
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {skippedRows.length > 0 ? (
            <SectionCard title={`Puladas (${skippedRows.length})`}>
              <ul className="-my-1 max-h-72 divide-y divide-hairline overflow-y-auto">
                {skippedRows.map((row) => (
                  <li key={row.breeding.id} className="flex min-h-11 items-center gap-2 px-1 py-2">
                    <span className="font-mono text-sm font-medium text-ink">{row.dam.earTag}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto min-h-11 text-brand md:min-h-0"
                      onClick={() => backToQueue(row)}
                      aria-label={`Voltar a vaca ${row.dam.earTag} para a fila`}
                    >
                      <Undo2 aria-hidden />
                      Voltar à fila
                    </Button>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
