"use client";

/**
 * Ultrassom tab of the Reprodução page: the coberturas waiting for the vet,
 * split by the lote each cow is in today — the Coberturas tab's lote rows,
 * same markup and same rules: up to three lotes start open, more start closed,
 * and a search opens every lote it keeps. Each cow has a "Prenhe" and a
 * "Vazia" button that save on tap; a diagnosed cow can change her result or go
 * back to waiting. "Iniciar ultrassom" on a lote opens its brete
 * (ultrasound-brete.tsx), one cow at a time, on the URL's `brete`.
 *
 * The groups come from {@link ultrasoundGroups} over the herd store, so the
 * list needs no request of its own; only the diagnosis goes to the server. The
 * exam date sits on the toolbar, not on each row: the vet examines the whole
 * lote on one morning, and every tap on the screen takes that date. A tap
 * confirms with a toast that can undo it. Without Reprodução edit the list only
 * reads: each cow shows her result, and the date and the buttons are gone.
 */
import { Fragment, useId, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  Search,
  Stethoscope,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { DiagnosisResult } from "@/lib/types";
import { ACTION_TOAST_MS, useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import {
  NO_LOT_KEY,
  pendingDiagnosisCount,
  searchUltrasound,
  ultrasoundGroups,
  type UltrasoundGroup,
  type UltrasoundRow,
} from "@/lib/domain/ultrasound";
import { BreedingPill, ResultPill } from "@/components/animal/reproduction-pills";
import { StartInseminationButton } from "@/components/breedings/start-insemination-button";
import { UltrasoundBrete } from "@/components/breedings/ultrasound-brete";
import {
  BullName,
  daysText,
  examDateError,
  ExamDateField,
  linkClass,
  ultrasoundBreteHref,
} from "@/components/breedings/ultrasound-parts";
import { ExportMenu } from "@/components/export/ExportMenu";
import { ultrasoundExportTable } from "@/lib/export/datasets/reproduction";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** A list with at most this many lotes opens all of them; more start closed. */
const OPEN_BY_DEFAULT_MAX = 3;

function groupName(group: Pick<UltrasoundGroup, "name">): string {
  return group.name ?? "Sem lote";
}

interface RowActionsProps {
  row: UltrasoundRow;
  /** The toolbar's exam date; null while it is blank or in the future. */
  examDate: string | null;
  /** "row" sits in a table cell; "card" spans the mobile card. */
  variant: "row" | "card";
  /** False without Reprodução edit: the result shows, nothing to tap. */
  canEdit: boolean;
}

/**
 * "Prenhe" and "Vazia" for a cow still waiting, or the result, "Alterar" and
 * "Voltar a pendente" once she has one — "Alterar" brings the buttons back for
 * that cow only. Every button stays disabled while the tap saves, and "Prenhe"
 * and "Vazia" for a cobertura dated after the exam.
 */
function RowActions({ row, examDate, variant, canEdit }: RowActionsProps) {
  const recordDiagnosis = useHerdStore((s) => s.recordDiagnosis);
  const clearDiagnosis = useHerdStore((s) => s.clearDiagnosis);
  const [changing, setChanging] = useState(false);
  const [saving, setSaving] = useState(false);
  const { dam, breeding } = row;

  async function diagnose(result: Exclude<DiagnosisResult, "pending">) {
    if (examDate === null) return;
    const earTag = dam.earTag;
    // What the tap replaces: "Desfazer" puts an earlier result back instead of erasing it.
    const previous = dam.reproduction?.diagnoses.find((d) => d.breedingId === breeding.id);
    setSaving(true);
    try {
      await recordDiagnosis(earTag, { breedingId: breeding.id, result, date: examDate });
    } catch {
      return; // The store already showed the failure.
    } finally {
      setSaving(false);
    }
    setChanging(false);

    async function undo() {
      try {
        if (previous) await recordDiagnosis(earTag, previous);
        else await clearDiagnosis(earTag, breeding.id);
      } catch {
        // The store already showed the failure.
      }
    }
    toast.success("Diagnóstico salvo", {
      duration: ACTION_TOAST_MS,
      action: { label: "Desfazer", onClick: () => void undo() },
    });
  }

  async function backToPending() {
    const earTag = dam.earTag;
    const previous = dam.reproduction?.diagnoses.find((d) => d.breedingId === breeding.id);
    if (previous === undefined) return;
    setSaving(true);
    try {
      await clearDiagnosis(earTag, breeding.id);
    } catch {
      return; // The store already showed the failure.
    } finally {
      setSaving(false);
    }

    const undo = async () => {
      try {
        await recordDiagnosis(earTag, previous);
      } catch {
        // The store already showed the failure.
      }
    };
    toast.success("Diagnóstico removido", {
      duration: ACTION_TOAST_MS,
      action: { label: "Desfazer", onClick: () => void undo() },
    });
  }

  if (!canEdit) {
    return (
      <div
        className={cn(
          "flex min-h-11 items-center",
          variant === "row" ? "ml-auto w-60 justify-end" : "mt-3"
        )}
      >
        <ResultPill result={row.result} />
      </div>
    );
  }

  if (row.result !== "pending" && !changing) {
    return (
      <div
        className={cn(
          "flex min-h-11 items-center gap-1",
          variant === "row" ? "ml-auto w-60" : "mt-3"
        )}
      >
        <ResultPill result={row.result} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto min-h-11 text-brand hover:text-brand"
          disabled={saving}
          onClick={() => setChanging(true)}
        >
          <Pencil data-icon="inline-start" aria-hidden />
          Alterar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 text-ink-soft hover:text-ink"
          disabled={saving}
          onClick={() => void backToPending()}
          aria-label={`Voltar a vaca ${dam.earTag} para aguardando diagnóstico`}
          title="Voltar a pendente"
        >
          <Undo2 aria-hidden />
        </Button>
      </div>
    );
  }

  const disabled = saving || examDate === null || breeding.date > examDate;
  return (
    <div className={variant === "row" ? "ml-auto flex w-60 justify-end gap-2" : "mt-3 grid grid-cols-2 gap-2"}>
      <Button
        type="button"
        variant="outline"
        className={cn("min-h-11 text-healthy hover:text-healthy", variant === "row" && "w-26")}
        disabled={disabled}
        onClick={() => void diagnose("pregnant")}
      >
        <Check data-icon="inline-start" aria-hidden />
        Prenhe
      </Button>
      <Button
        type="button"
        variant="outline"
        className={cn("min-h-11 text-ink-soft hover:text-ink", variant === "row" && "w-26")}
        disabled={disabled}
        onClick={() => void diagnose("open")}
      >
        <X data-icon="inline-start" aria-hidden />
        Vazia
      </Button>
    </div>
  );
}

/** "16 aguardando · 6 prenhes · 2 vazias", leaving out the counts at zero. */
function GroupCounts({ group }: { group: UltrasoundGroup }) {
  const parts = [
    { key: "pending", count: group.pending, one: "aguardando", many: "aguardando" },
    { key: "pregnant", count: group.pregnant, one: "prenhe", many: "prenhes" },
    { key: "open", count: group.open, one: "vazia", many: "vazias" },
  ].filter((part) => part.count > 0);

  return (
    <span className="block text-xs text-ink-soft">
      {parts.map((part, index) => (
        <Fragment key={part.key}>
          {index > 0 ? " · " : null}
          <span className="font-mono font-medium text-ink">{formatNumber(part.count)}</span>{" "}
          {part.count === 1 ? part.one : part.many}
        </Fragment>
      ))}
    </span>
  );
}

/** "Iniciar ultrassom" of one lote: into its brete. */
function StartUltrasoundLink({ group, className }: { group: UltrasoundGroup; className?: string }) {
  return (
    <Button asChild variant="outline" size="sm" className={cn("min-h-11 md:min-h-8", className)}>
      <Link
        href={ultrasoundBreteHref(group.key)}
        scroll={false}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Iniciar ultrassom de ${groupName(group)}`}
      >
        <Stethoscope data-icon="inline-start" aria-hidden />
        Iniciar ultrassom
      </Link>
    </Button>
  );
}

export function UltrasoundList({ brete }: { brete: string | null }) {
  const animals = useHerdStore((s) => s.animals);
  const sessions = useHerdStore((s) => s.manejoSessions);
  const semenBulls = useHerdStore((s) => s.semenBulls);
  const lots = useHerdStore((s) => s.lots);
  const canEdit = useCan("reproduction", "edit");
  const canStartInsemination = useCan("manejo", "edit");
  const idPrefix = useId();
  const today = todayISO();
  const [examDate, setExamDate] = useState(today);
  const [search, setSearch] = useState("");
  /** Lotes the farmer opened or closed, over the default. */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  /** Lotes closed under the current search; forgotten whenever the search changes. */
  const [closedInSearch, setClosedInSearch] = useState<ReadonlySet<string>>(() => new Set());

  const groups = useMemo(
    () => ultrasoundGroups(animals, sessions, semenBulls, lots, today),
    [animals, sessions, semenBulls, lots, today]
  );
  const shown = useMemo(() => searchUltrasound(groups, search), [groups, search]);
  const dateError = examDateError(examDate, today);
  const tapDate = dateError === null ? examDate : null;
  const searching = search.trim() !== "";
  const openByDefault = groups.length <= OPEN_BY_DEFAULT_MAX;
  const cowsLabel = (list: UltrasoundGroup[]) => {
    const n = list.reduce((total, group) => total + group.rows.length, 0);
    return n === 1 ? "1 vaca" : `${formatNumber(n)} vacas`;
  };

  function isOpen(key: string): boolean {
    if (searching) return !closedInSearch.has(key);
    return toggled[key] ?? openByDefault;
  }

  function toggle(key: string) {
    if (searching) {
      setClosedInSearch((previous) => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      return;
    }
    setToggled((previous) => ({ ...previous, [key]: !(previous[key] ?? openByDefault) }));
  }

  function changeSearch(value: string) {
    setSearch(value);
    setClosedInSearch(new Set());
  }

  if (canEdit && brete !== null) {
    const lotName =
      brete === NO_LOT_KEY
        ? "Sem lote"
        : (lots.find((lot) => lot.id === brete)?.name ?? "Lote não encontrado");
    return (
      <UltrasoundBrete
        key={brete}
        group={groups.find((group) => group.key === brete) ?? null}
        lotName={lotName}
        examDate={examDate}
        onExamDateChange={setExamDate}
      />
    );
  }

  if (groups.length === 0) {
    return (
      <section className="rounded-lg border border-hairline bg-panel pb-10">
        <EmptyState
          icon={Stethoscope}
          title="Nenhuma cobertura aguardando diagnóstico"
          description="Depois de uma inseminação ou monta natural, as vacas aparecem aqui para o ultrassom."
          className="pb-4"
        />
        {canStartInsemination ? (
          <div className="flex justify-center px-4">
            <StartInseminationButton variant="outline" />
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        {canEdit ? (
          <ExamDateField
            id="ultrasound-exam-date"
            value={examDate}
            todayIso={today}
            onChange={setExamDate}
          />
        ) : null}
        <div className={cn("relative md:w-60", canEdit && "md:ml-3")}>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => changeSearch(e.target.value)}
            placeholder="Buscar brinco"
            aria-label="Buscar vaca por brinco"
            className="min-h-11 pl-9 font-mono md:min-h-9"
          />
        </div>
        <p className="text-xs text-ink-soft md:ml-auto md:text-sm">
          <span className="font-mono font-medium text-ink">{pendingDiagnosisCount(groups)}</span>{" "}
          aguardando diagnóstico
        </p>
        <ExportMenu
          title="Ultrassom"
          className="self-start md:self-auto"
          current={{
            label: "Busca atual",
            detail: searching ? `${cowsLabel(shown)} · brinco ${search.trim()}` : cowsLabel(shown),
            filters: searching ? [`Busca: ${search.trim()}`] : [],
            build: () => [ultrasoundExportTable(shown)],
          }}
          all={
            searching
              ? {
                  label: "Lista toda",
                  detail: cowsLabel(groups),
                  build: () => [ultrasoundExportTable(groups)],
                }
              : undefined
          }
          hint="Lote a lote, na ordem da tela, com o diagnóstico e a observação de cada vaca."
        />
      </div>

      <section className="rounded-lg border border-hairline bg-panel p-4">
        {shown.length === 0 ? (
          <p className="text-sm text-ink-soft">Nenhum brinco corresponde à busca.</p>
        ) : (
          <>
            {/* Desktop: one row per lote, its cows nested under it when open */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lote</TableHead>
                    <TableHead className="text-right">Aguardando</TableHead>
                    <TableHead className="text-right">Prenhes</TableHead>
                    <TableHead className="text-right">Vazias</TableHead>
                    <TableHead className="w-44 text-right">
                      <span className="sr-only">Iniciar ultrassom</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((group, index) => {
                    const open = isOpen(group.key);
                    const panelId = `${idPrefix}-tabela-${index}`;
                    const Chevron = open ? ChevronDown : ChevronRight;
                    return (
                      <Fragment key={group.key}>
                        <TableRow
                          onClick={() => toggle(group.key)}
                          className="cursor-pointer has-aria-expanded:bg-surface"
                        >
                          <TableCell className="py-3">
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-controls={open ? panelId : undefined}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(group.key);
                              }}
                              className="inline-flex items-center gap-2 font-semibold text-ink"
                            >
                              <Chevron className="size-4 text-ink-soft" aria-hidden />
                              {groupName(group)}
                            </button>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatNumber(group.pending)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatNumber(group.pregnant)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatNumber(group.open)}
                          </TableCell>
                          <TableCell className="text-right">
                            {canEdit ? <StartUltrasoundLink group={group} /> : null}
                          </TableCell>
                        </TableRow>

                        {open ? (
                          <TableRow id={panelId} className="hover:bg-transparent">
                            <TableCell colSpan={5} className="p-0 pb-2">
                              {/* Shared widths line the columns up across the lotes. */}
                              <Table>
                                <TableHeader>
                                  <TableRow className="hover:bg-transparent [&>th]:border-b">
                                    <TableHead className="w-[12%] pl-6 text-xs text-ink-soft">Matriz</TableHead>
                                    <TableHead className="w-[13%] text-xs text-ink-soft">Cobertura</TableHead>
                                    <TableHead className="w-[20%] text-xs text-ink-soft">Touro</TableHead>
                                    <TableHead className="w-[14%] text-xs text-ink-soft">Tipo</TableHead>
                                    <TableHead className="w-[7%] text-right text-xs text-ink-soft">Dias</TableHead>
                                    <TableHead className="text-right">
                                      <span className="sr-only">Diagnóstico</span>
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {group.rows.map((row) => (
                                    <TableRow key={row.breeding.id}>
                                      <TableCell className="pl-6">
                                        <Link href={`/herd/${row.dam.id}`} className={linkClass}>
                                          {row.dam.earTag}
                                        </Link>
                                      </TableCell>
                                      <TableCell className="font-mono text-ink">
                                        {formatDate(row.breeding.date)}
                                      </TableCell>
                                      <TableCell className="truncate">
                                        <BullName row={row} />
                                      </TableCell>
                                      <TableCell>
                                        <BreedingPill type={row.breeding.type} />
                                      </TableCell>
                                      <TableCell className="text-right font-mono text-ink">
                                        {row.days}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <RowActions
                                          row={row}
                                          examDate={tapDate}
                                          variant="row"
                                          canEdit={canEdit}
                                        />
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile: a tappable row per lote over the stacked cards */}
            <div className="-my-2 divide-y divide-hairline md:hidden">
              {shown.map((group, index) => {
                const open = isOpen(group.key);
                const panelId = `${idPrefix}-cards-${index}`;
                const Chevron = open ? ChevronDown : ChevronRight;
                return (
                  <div key={group.key}>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={open ? panelId : undefined}
                      onClick={() => toggle(group.key)}
                      className="flex min-h-14 w-full items-center gap-2.5 py-2 text-left"
                    >
                      <Chevron className="size-4 shrink-0 text-ink-soft" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink">
                          {groupName(group)}
                        </span>
                        <GroupCounts group={group} />
                      </span>
                    </button>

                    {open ? (
                      <div id={panelId} className="space-y-3 pt-1 pb-4">
                        {canEdit ? <StartUltrasoundLink group={group} className="w-full" /> : null}
                        <ul className="space-y-3">
                          {group.rows.map((row) => (
                            <li
                              key={row.breeding.id}
                              className="rounded-lg border border-hairline bg-surface p-4"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <Link href={`/herd/${row.dam.id}`} className={linkClass}>
                                  {row.dam.earTag}
                                </Link>
                                <span className="font-mono text-xs text-ink-soft">
                                  {formatDate(row.breeding.date)} · {daysText(row.days)}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <BreedingPill type={row.breeding.type} />
                                <span className="text-xs text-ink-soft">
                                  Touro <BullName row={row} className="font-medium" />
                                </span>
                              </div>
                              <RowActions
                                row={row}
                                examDate={tapDate}
                                variant="card"
                                canEdit={canEdit}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
