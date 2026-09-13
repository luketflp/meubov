"use client";

/**
 * Ultrassom tab of the Reprodução page: the coberturas waiting for the vet, one
 * card per inseminação and then the coberturas avulsas, each cow with a
 * "Prenhe" and a "Vazia" button that save on tap. Table on desktop, stacked
 * cards on mobile — the same shape as the Coberturas tab.
 *
 * The groups come from {@link ultrasoundGroups} over the herd store, so the
 * list needs no request of its own; only the diagnosis goes to the server. The
 * exam date sits on the toolbar, not on each row: the vet examines the whole
 * lote on one morning, and every tap on the screen takes that date. A tap
 * confirms with a toast that can undo it.
 */
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Pencil, Search, Stethoscope, X } from "lucide-react";
import { toast } from "sonner";
import type { DiagnosisResult } from "@/lib/types";
import { ACTION_TOAST_MS, useHerdStore } from "@/lib/store/useHerdStore";
import { formatDate, todayISO } from "@/lib/domain/dates";
import {
  pendingDiagnosisCount,
  searchUltrasound,
  ultrasoundGroups,
  type UltrasoundGroup,
  type UltrasoundRow,
} from "@/lib/domain/ultrasound";
import { BreedingPill, ResultPill } from "@/components/animal/reproduction-pills";
import { StartInseminationButton } from "@/components/breedings/start-insemination-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const linkClass = "font-mono font-medium text-ink underline-offset-2 hover:underline";

/** "1 dia", "39 dias". */
const daysText = (days: number): string => `${days} ${days === 1 ? "dia" : "dias"}`;

/** Why the toolbar's date cannot take a tap yet; null when it can. */
function examDateError(date: string, todayIso: string): string | null {
  if (!ISO_DATE_PATTERN.test(date)) return "Informe a data do diagnóstico.";
  if (date > todayIso) return "O diagnóstico não pode ser no futuro.";
  return null;
}

/** The bull: a registered semen bull by name, a herd bull or a semen code by its tag. */
function BullName({ row, className }: { row: UltrasoundRow; className?: string }) {
  if (row.bull !== null) {
    return <span className={cn("text-ink", className)}>{row.bull.name}</span>;
  }
  return (
    <span className={cn("font-mono text-ink", className)}>{row.breeding.bullEarTag}</span>
  );
}

interface RowActionsProps {
  row: UltrasoundRow;
  /** The toolbar's exam date; null while it is blank or in the future. */
  examDate: string | null;
  /** "row" sits in a table cell; "card" spans the mobile card. */
  variant: "row" | "card";
}

/**
 * "Prenhe" and "Vazia" for a cow still waiting, or the result and "Alterar"
 * once she has one — which brings the buttons back for that cow only. Both
 * buttons stay disabled while the tap saves, and for a cobertura dated after
 * the exam.
 */
function RowActions({ row, examDate, variant }: RowActionsProps) {
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

  if (row.result !== "pending" && !changing) {
    return (
      <div
        className={cn(
          "flex min-h-11 items-center justify-between gap-2",
          variant === "row" ? "ml-auto w-54" : "mt-3"
        )}
      >
        <ResultPill result={row.result} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 text-brand hover:text-brand"
          onClick={() => setChanging(true)}
        >
          <Pencil data-icon="inline-start" aria-hidden />
          Alterar
        </Button>
      </div>
    );
  }

  const disabled = saving || examDate === null || breeding.date > examDate;
  return (
    <div className={variant === "row" ? "ml-auto flex w-54 justify-end gap-2" : "mt-3 grid grid-cols-2 gap-2"}>
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

/** "16 pendentes · 6 prenhes · 2 vazias", leaving out the counts at zero. */
function GroupCounts({ group }: { group: UltrasoundGroup }) {
  const parts = [
    { key: "pending", count: group.pending, one: "pendente", many: "pendentes" },
    { key: "pregnant", count: group.pregnant, one: "prenhe", many: "prenhes" },
    { key: "open", count: group.open, one: "vazia", many: "vazias" },
  ].filter((part) => part.count > 0);

  return (
    <p className="text-xs whitespace-nowrap text-ink-soft">
      {parts.map((part, index) => (
        <Fragment key={part.key}>
          {index > 0 ? " · " : null}
          <span className="font-mono font-medium text-ink">{part.count}</span>{" "}
          {part.count === 1 ? part.one : part.many}
        </Fragment>
      ))}
    </p>
  );
}

interface GroupCardProps {
  group: UltrasoundGroup;
  lotNames: Map<string, string>;
  examDate: string | null;
}

/**
 * One inseminação, or the coberturas avulsas. SectionCard's anatomy with a line
 * beside the title — the lote and how long ago — the way the invernada groups
 * on Lotes carry theirs.
 */
function GroupCard({ group, lotNames, examDate }: GroupCardProps) {
  const title =
    group.date === null ? "Coberturas avulsas" : `Inseminação de ${formatDate(group.date)}`;
  const lotName = group.lotId === null ? undefined : lotNames.get(group.lotId);
  const detail =
    group.days === null
      ? null
      : [lotName, daysText(group.days)].filter((part) => part !== undefined).join(" · ");

  return (
    <section className="rounded-lg border border-hairline bg-panel">
      <header className="flex flex-col gap-0.5 border-b border-hairline px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-2">
        <div className="flex min-w-0 flex-col gap-0.5 md:flex-row md:items-baseline md:gap-2">
          <h2 className="font-heading text-base font-semibold text-ink">{title}</h2>
          {detail ? <p className="text-xs text-ink-soft">{detail}</p> : null}
        </div>
        <GroupCounts group={group} />
      </header>

      <div className="p-4">
        {/* Desktop: table. Fixed columns on wide screens, so the cards line up. */}
        <div className="hidden md:block">
          <Table className="xl:table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="xl:w-40">Matriz</TableHead>
                <TableHead className="xl:w-60">Touro</TableHead>
                <TableHead className="xl:w-40">Tipo</TableHead>
                <TableHead className="text-right xl:w-18">Dias</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Diagnóstico</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.rows.map((row) => (
                <TableRow key={row.breeding.id}>
                  <TableCell>
                    <Link href={`/herd/${row.dam.id}`} className={linkClass}>
                      {row.dam.earTag}
                    </Link>
                  </TableCell>
                  <TableCell className="truncate">
                    <BullName row={row} />
                  </TableCell>
                  <TableCell>
                    <BreedingPill type={row.breeding.type} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-ink">{row.days}</TableCell>
                  <TableCell className="text-right">
                    <RowActions row={row} examDate={examDate} variant="row" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile: stacked cards */}
        <ul className="space-y-3 md:hidden">
          {group.rows.map((row) => (
            <li
              key={row.breeding.id}
              className="rounded-lg border border-hairline bg-surface p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <Link href={`/herd/${row.dam.id}`} className={linkClass}>
                  {row.dam.earTag}
                </Link>
                <span className="font-mono text-xs text-ink-soft">{daysText(row.days)}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <BreedingPill type={row.breeding.type} />
                <span className="text-xs text-ink-soft">
                  Touro <BullName row={row} className="font-medium" />
                </span>
              </div>
              <RowActions row={row} examDate={examDate} variant="card" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function UltrasoundList() {
  const animals = useHerdStore((s) => s.animals);
  const sessions = useHerdStore((s) => s.manejoSessions);
  const semenBulls = useHerdStore((s) => s.semenBulls);
  const lots = useHerdStore((s) => s.lots);
  const today = todayISO();
  const [examDate, setExamDate] = useState(today);
  const [search, setSearch] = useState("");

  const groups = useMemo(
    () => ultrasoundGroups(animals, sessions, semenBulls, today),
    [animals, sessions, semenBulls, today]
  );
  const shown = useMemo(() => searchUltrasound(groups, search), [groups, search]);
  const lotNames = useMemo(() => new Map(lots.map((lot) => [lot.id, lot.name])), [lots]);
  const dateError = examDateError(examDate, today);
  const tapDate = dateError === null ? examDate : null;

  if (groups.length === 0) {
    return (
      <section className="rounded-lg border border-hairline bg-panel pb-10">
        <EmptyState
          icon={Stethoscope}
          title="Nenhuma cobertura aguardando diagnóstico"
          description="Depois de uma inseminação ou monta natural, as vacas aparecem aqui para o ultrassom."
          className="pb-4"
        />
        <div className="flex justify-center px-4">
          <StartInseminationButton variant="outline" />
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        <div className="grid gap-1.5 md:flex md:items-center md:gap-2.5">
          <Label htmlFor="ultrasound-exam-date">Data do exame</Label>
          <Input
            id="ultrasound-exam-date"
            type="date"
            max={today}
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            aria-describedby="ultrasound-exam-date-hint"
            aria-invalid={dateError !== null}
            className="min-h-11 font-mono md:min-h-9 md:w-44"
          />
        </div>
        <p
          id="ultrasound-exam-date-hint"
          className={cn("-mt-1.5 text-xs md:mt-0", dateError ? "text-overdue" : "text-ink-soft")}
        >
          {dateError ?? "Vale para todos os toques desta tela"}
        </p>
        <div className="relative md:ml-3 md:w-60">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar brinco"
            aria-label="Buscar vaca por brinco"
            className="min-h-11 pl-9 font-mono md:min-h-9"
          />
        </div>
        <p className="text-xs text-ink-soft md:ml-auto md:text-sm">
          <span className="font-mono font-medium text-ink">{pendingDiagnosisCount(groups)}</span>{" "}
          aguardando diagnóstico
        </p>
      </div>

      {shown.length === 0 ? (
        <p className="text-xs text-ink-soft">Nenhum brinco corresponde à busca.</p>
      ) : (
        shown.map((group) => (
          <GroupCard key={group.key} group={group} lotNames={lotNames} examDate={tapDate} />
        ))
      )}
    </div>
  );
}
