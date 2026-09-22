"use client";

/**
 * Reprodução log: every breeding on the farm, split by the lote each dam is in
 * today, newest first inside each lote, joining the dam to the bull and to what
 * became of the cobertura — its diagnosis and, when pregnant, the calving it
 * forecasts. One row per lote with its coberturas, aguardando and prenhes,
 * opening to the coberturas — the raça groups of a lote's ficha, same markup
 * and same rules: up to three lotes start open, more start closed, and a
 * filter opens every lote it keeps. Desktop nests each lote's table under its
 * row; mobile stacks the cards under a tappable lote row.
 *
 * The rows come straight from the herd store: a breeding already travels
 * inside its dam's reproduction record, so this screen needs no request of its
 * own. The filter is local state — it narrows what is on screen and nothing
 * else.
 */
import { Fragment, useId, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, HeartPulse } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import {
  breedingsByLot,
  recentBreedings,
  filterBreedings,
  type BreedingFilter,
  type BreedingLotGroup,
  type BreedingRow,
} from "@/lib/store/selectors";
import { todayISO, formatDate } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { daysToCalving, daysToCalvingText } from "@/lib/domain/reproduction";
import { ResultPill, BreedingPill } from "@/components/animal/reproduction-pills";
import { RowDiagnosisDialog } from "@/components/breedings/row-diagnosis-dialog";
import { semenBullHref } from "@/components/semen/helpers";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const FILTER_LABEL: Record<BreedingFilter, string> = {
  all: "Todas as coberturas",
  pending: "Aguardando diagnóstico",
  pregnant: "Prenhes",
  open: "Vazias",
};
const FILTER_LIST = Object.keys(FILTER_LABEL) as BreedingFilter[];

/** A list with at most this many lotes opens all of them; more start closed. */
const OPEN_BY_DEFAULT_MAX = 3;

/** The dams whose lote resolves to nothing. */
const NO_LOT_KEY = "sem-lote";

const linkClass = "font-mono font-medium text-ink underline-offset-2 hover:underline";

/**
 * The bull of the cobertura. A registered semen bull shows by name, linked to
 * its page on Touros; a herd bull by ear tag, linked to its ficha. An external
 * bull or a semen code typed by hand has neither — the tag still shows, as
 * plain text.
 */
function BullTag({ row }: { row: BreedingRow }) {
  if (row.semenBull !== null) {
    return (
      <Link
        href={semenBullHref(row.semenBull.id)}
        className="font-medium text-ink underline-offset-2 hover:underline"
      >
        {row.semenBull.name}
      </Link>
    );
  }
  if (row.bull === null) {
    return (
      <span className="font-mono font-medium text-ink">{row.breeding.bullEarTag}</span>
    );
  }
  return (
    <Link href={`/herd/${row.bull.id}`} className={linkClass}>
      {row.bull.earTag}
    </Link>
  );
}

/** The open/closed key of a lote group. */
function groupKey(group: BreedingLotGroup): string {
  return group.lotId ?? NO_LOT_KEY;
}

function groupName(group: BreedingLotGroup): string {
  return group.name ?? "Sem lote";
}

function breedingsLabel(count: number): string {
  return `${formatNumber(count)} ${count === 1 ? "cobertura" : "coberturas"}`;
}

/** Whether the row still takes a diagnosis: no result yet, dam still on the farm. */
function awaitsDiagnosis(row: BreedingRow): boolean {
  return row.outcome.result === "pending" && row.dam.active;
}

/** "em N dias" for the forecast — the ficha's wording, so both screens agree. */
function forecastDistance(expectedIso: string, todayIso: string): string {
  return daysToCalvingText(daysToCalving(expectedIso, todayIso));
}

export function BreedingsList() {
  const animals = useHerdStore((s) => s.animals);
  const semenBulls = useHerdStore((s) => s.semenBulls);
  const lots = useHerdStore((s) => s.lots);
  const canEdit = useCan("reproduction", "edit");
  const idPrefix = useId();
  const [filter, setFilter] = useState<BreedingFilter>("all");
  /** Lotes the farmer opened or closed, over the default. */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  /** Lotes closed under the current filter; forgotten whenever the filter changes. */
  const [closedInFilter, setClosedInFilter] = useState<ReadonlySet<string>>(() => new Set());
  const rows = useMemo(() => recentBreedings(animals, semenBulls), [animals, semenBulls]);
  const shown = useMemo(() => filterBreedings(rows, filter), [rows, filter]);
  const groups = useMemo(() => breedingsByLot(shown, lots), [shown, lots]);
  const lotCount = useMemo(() => breedingsByLot(rows, lots).length, [rows, lots]);
  const filtering = filter !== "all";
  const openByDefault = lotCount <= OPEN_BY_DEFAULT_MAX;
  const today = todayISO();

  function isOpen(key: string): boolean {
    if (filtering) return !closedInFilter.has(key);
    return toggled[key] ?? openByDefault;
  }

  function toggle(key: string) {
    if (filtering) {
      setClosedInFilter((previous) => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      return;
    }
    setToggled((previous) => ({ ...previous, [key]: !(previous[key] ?? openByDefault) }));
  }

  function changeFilter(value: BreedingFilter) {
    setFilter(value);
    setClosedInFilter(new Set());
  }

  return (
    <SectionCard
      title="Coberturas registradas"
      action={
        rows.length > 0 ? (
          <Select value={filter} onValueChange={(value) => changeFilter(value as BreedingFilter)}>
            <SelectTrigger className="min-h-11 md:min-h-8" aria-label="Filtrar coberturas">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_LIST.map((option) => (
                <SelectItem key={option} value={option}>
                  {FILTER_LABEL[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title="Nenhuma cobertura registrada"
          description="Registre uma cobertura para acompanhar o diagnóstico e a previsão de parto de cada matriz."
        />
      ) : shown.length === 0 ? (
        <p className="text-sm text-ink-soft">Nenhuma cobertura nesse filtro.</p>
      ) : (
        <>
          {/* Desktop: one row per lote, its coberturas nested under it when open */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lote</TableHead>
                  <TableHead className="text-right">Coberturas</TableHead>
                  <TableHead className="text-right">Aguardando</TableHead>
                  <TableHead className="text-right">Prenhes</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Abrir lote</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group, index) => {
                  const key = groupKey(group);
                  const open = isOpen(key);
                  const panelId = `${idPrefix}-tabela-${index}`;
                  const Chevron = open ? ChevronDown : ChevronRight;
                  return (
                    <Fragment key={key}>
                      <TableRow
                        onClick={() => toggle(key)}
                        className="cursor-pointer has-aria-expanded:bg-surface"
                      >
                        <TableCell className="py-3">
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-controls={open ? panelId : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggle(key);
                            }}
                            className="inline-flex items-center gap-2 font-semibold text-ink"
                          >
                            <Chevron className="size-4 text-ink-soft" aria-hidden />
                            {groupName(group)}
                          </button>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatNumber(group.rows.length)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatNumber(group.pending)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatNumber(group.pregnant)}
                        </TableCell>
                        <TableCell />
                      </TableRow>

                      {open ? (
                        <TableRow id={panelId} className="hover:bg-transparent">
                          <TableCell colSpan={5} className="p-0 pb-2">
                            {/* Shared widths line the columns up across the lotes. */}
                            <Table>
                              <TableHeader>
                                <TableRow className="hover:bg-transparent [&>th]:border-b">
                                  <TableHead className="w-[13%] pl-6 text-xs text-ink-soft">Data</TableHead>
                                  <TableHead className="w-[10%] text-xs text-ink-soft">Matriz</TableHead>
                                  <TableHead className="w-[15%] text-xs text-ink-soft">Tipo</TableHead>
                                  <TableHead className="w-[14%] text-xs text-ink-soft">Touro</TableHead>
                                  <TableHead className="w-[13%] text-xs text-ink-soft">Diagnóstico</TableHead>
                                  <TableHead className="w-[21%] text-xs text-ink-soft">
                                    Previsão de parto
                                  </TableHead>
                                  <TableHead className="text-right">
                                    <span className="sr-only">Ações</span>
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {group.rows.map((row) => (
                                  <TableRow key={row.key}>
                                    <TableCell className="pl-6 font-mono text-ink">
                                      {formatDate(row.breeding.date)}
                                    </TableCell>
                                    <TableCell>
                                      <Link href={`/herd/${row.dam.id}`} className={linkClass}>
                                        {row.dam.earTag}
                                      </Link>
                                    </TableCell>
                                    <TableCell>
                                      <BreedingPill type={row.breeding.type} />
                                    </TableCell>
                                    <TableCell>
                                      <BullTag row={row} />
                                    </TableCell>
                                    <TableCell>
                                      <ResultPill result={row.outcome.result} />
                                    </TableCell>
                                    <TableCell>
                                      {row.outcome.expectedCalvingDate === null ? (
                                        <span className="text-ink-soft">—</span>
                                      ) : (
                                        <>
                                          <span className="font-mono text-ink">
                                            {formatDate(row.outcome.expectedCalvingDate)}
                                          </span>{" "}
                                          <span className="text-xs text-ink-soft">
                                            ·{" "}
                                            {forecastDistance(
                                              row.outcome.expectedCalvingDate,
                                              today
                                            )}
                                          </span>
                                        </>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {canEdit && awaitsDiagnosis(row) ? (
                                        <RowDiagnosisDialog
                                          dam={row.dam}
                                          breeding={row.breeding}
                                          variant="row"
                                        />
                                      ) : null}
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
            {groups.map((group, index) => {
              const key = groupKey(group);
              const open = isOpen(key);
              const panelId = `${idPrefix}-cards-${index}`;
              const Chevron = open ? ChevronDown : ChevronRight;
              return (
                <div key={key}>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={open ? panelId : undefined}
                    onClick={() => toggle(key)}
                    className="flex min-h-14 w-full items-center gap-2.5 py-2 text-left"
                  >
                    <Chevron className="size-4 shrink-0 text-ink-soft" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">
                        {groupName(group)}
                      </span>
                      <span className="block text-xs text-ink-soft">
                        {breedingsLabel(group.rows.length)} · {formatNumber(group.pending)}{" "}
                        aguardando
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs text-ink-soft">prenhes</span>
                      <span className="block font-mono text-sm font-medium text-ink">
                        {formatNumber(group.pregnant)}
                      </span>
                    </span>
                  </button>

                  {open ? (
                    <ul id={panelId} className="space-y-3 pt-1 pb-4">
                      {group.rows.map((row) => (
                        <li
                          key={row.key}
                          className="rounded-lg border border-hairline bg-surface p-4"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Link href={`/herd/${row.dam.id}`} className={linkClass}>
                              {row.dam.earTag}
                            </Link>
                            <span className="font-mono text-xs text-ink-soft">
                              {formatDate(row.breeding.date)}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <BreedingPill type={row.breeding.type} />
                            <ResultPill result={row.outcome.result} />
                          </div>
                          <p className="mt-2 text-xs text-ink-soft">
                            Touro <BullTag row={row} />
                          </p>
                          {row.outcome.expectedCalvingDate === null ? null : (
                            <p className="mt-1 text-xs text-ink-soft">
                              Parto previsto{" "}
                              <span className="font-mono text-ink">
                                {formatDate(row.outcome.expectedCalvingDate)}
                              </span>{" "}
                              · {forecastDistance(row.outcome.expectedCalvingDate, today)}
                            </p>
                          )}
                          {canEdit && awaitsDiagnosis(row) ? (
                            <RowDiagnosisDialog
                              dam={row.dam}
                              breeding={row.breeding}
                              variant="card"
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </SectionCard>
  );
}
