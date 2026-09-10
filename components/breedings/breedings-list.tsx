"use client";

/**
 * Coberturas log: every breeding on the farm, newest first, joining the dam to
 * the bull and to what became of the cobertura — its diagnosis and, when
 * pregnant, the calving it forecasts. Table on desktop, stacked cards on
 * mobile — the same shape the Nascimentos log uses.
 *
 * The rows come straight from the herd store: a breeding already travels
 * inside its dam's reproduction record, so this screen needs no request of its
 * own. The filter is local state — it narrows what is on screen and nothing
 * else.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { HeartPulse } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import {
  recentBreedings,
  filterBreedings,
  type BreedingFilter,
  type BreedingRow,
} from "@/lib/store/selectors";
import { todayISO, formatDate } from "@/lib/domain/dates";
import { daysToCalving, daysToCalvingText } from "@/lib/domain/reproduction";
import { ResultPill, BreedingPill } from "@/components/animal/reproduction-pills";
import { RowDiagnosisDialog } from "@/components/breedings/row-diagnosis-dialog";
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

const linkClass = "font-mono font-medium text-ink underline-offset-2 hover:underline";

/**
 * The bull's ear tag, linked to its ficha when it is a herd animal. An
 * external bull or a semen code has no ficha — the tag still shows, as plain
 * text.
 */
function BullTag({ row }: { row: BreedingRow }) {
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
  const [filter, setFilter] = useState<BreedingFilter>("all");
  const rows = useMemo(() => recentBreedings(animals), [animals]);
  const shown = useMemo(() => filterBreedings(rows, filter), [rows, filter]);
  const today = todayISO();

  return (
    <SectionCard
      title="Coberturas registradas"
      action={
        rows.length > 0 ? (
          <Select
            value={filter}
            onValueChange={(value) => setFilter(value as BreedingFilter)}
          >
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
          {/* Desktop: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Matriz</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Touro</TableHead>
                  <TableHead>Diagnóstico</TableHead>
                  <TableHead>Previsão de parto</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-mono text-ink">
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
                            · {forecastDistance(row.outcome.expectedCalvingDate, today)}
                          </span>
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {awaitsDiagnosis(row) ? (
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
          </div>

          {/* Mobile: stacked cards */}
          <ul className="space-y-3 md:hidden">
            {shown.map((row) => (
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
                {awaitsDiagnosis(row) ? (
                  <RowDiagnosisDialog dam={row.dam} breeding={row.breeding} variant="card" />
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
