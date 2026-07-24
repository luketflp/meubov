"use client";

/**
 * "Health history" section: animal treatments with derived status,
 * current withdrawal period and mark-as-done action. Table on desktop,
 * stacked cards on mobile.
 */
import { Syringe } from "lucide-react";
import type { TreatmentStatus, Treatment } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { TODAY_ISO, addDays, formatDate } from "@/lib/domain/dates";
import { TREATMENT_TYPE_LABEL } from "@/lib/domain/labels";
import { deriveTreatmentStatus } from "@/lib/domain/status";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TreatmentRow {
  treatment: Treatment;
  status: TreatmentStatus;
  withdrawalUntil: string | null;
}

/** End of the withdrawal period (ISO) if the treatment is done and it still applies today. */
function activeWithdrawalUntil(t: Treatment, status: TreatmentStatus): string | null {
  if (status !== "done") return null;
  const end = addDays(t.date, t.withdrawalDays);
  return end >= TODAY_ISO ? end : null;
}

function withdrawalText(row: TreatmentRow): string {
  return row.withdrawalUntil ? `carência até ${formatDate(row.withdrawalUntil)}` : "—";
}

interface HealthHistoryProps {
  treatments: Treatment[];
}

export function HealthHistory({ treatments }: HealthHistoryProps) {
  const markTreatmentDone = useHerdStore((s) => s.markTreatmentDone);

  const rows: TreatmentRow[] = [...treatments]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((treatment) => {
      const status = deriveTreatmentStatus(treatment, TODAY_ISO);
      return { treatment, status, withdrawalUntil: activeWithdrawalUntil(treatment, status) };
    });

  if (rows.length === 0) {
    return (
      <SectionCard title="Histórico sanitário">
        <EmptyState
          icon={Syringe}
          title="Nenhum tratamento registrado"
          description="Este animal ainda não tem vacinas, vermifugações, medicações ou exames."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Histórico sanitário">
      {/* Table (desktop) */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Carência</TableHead>
              <TableHead>Obs.</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.treatment.id}>
                <TableCell className="font-medium text-ink">
                  {row.treatment.name}
                </TableCell>
                <TableCell className="text-ink-soft">
                  {TREATMENT_TYPE_LABEL[row.treatment.type]}
                </TableCell>
                <TableCell className="font-mono">
                  {formatDate(row.treatment.date)}
                </TableCell>
                <TableCell>
                  <StatusPill status={row.status} />
                </TableCell>
                <TableCell className="text-ink-soft">{withdrawalText(row)}</TableCell>
                <TableCell className="max-w-48 truncate text-ink-soft">
                  {row.treatment.notes ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  {row.status !== "done" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => markTreatmentDone(row.treatment.id)}
                    >
                      Marcar como feito
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Stacked cards (mobile) */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li
            key={row.treatment.id}
            className="rounded-lg border border-hairline bg-surface p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">{row.treatment.name}</p>
              <StatusPill status={row.status} />
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              {TREATMENT_TYPE_LABEL[row.treatment.type]} ·{" "}
              <span className="font-mono">{formatDate(row.treatment.date)}</span>
              {row.withdrawalUntil ? <> · {withdrawalText(row)}</> : null}
            </p>
            {row.treatment.notes ? (
              <p className="mt-1 text-xs text-ink-soft">{row.treatment.notes}</p>
            ) : null}
            {row.status !== "done" ? (
              <Button
                variant="outline"
                className="mt-3 min-h-11 w-full"
                onClick={() => markTreatmentDone(row.treatment.id)}
              >
                Marcar como feito
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
