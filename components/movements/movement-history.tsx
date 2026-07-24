"use client";

/**
 * "Movement history" section: table on desktop and stacked cards
 * on mobile, always in descending order of date.
 */
import { ArrowLeftRight, ArrowRight } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import type { Movement } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MovementTypePill } from "@/components/movements/movement-type-pill";

/** Sequential number of the "mov-N" id, for a stable tie-break in the sort. */
function idNumber(id: string): number {
  const n = Number(id.split("-")[1]);
  return Number.isFinite(n) ? n : 0;
}

/** Sorts by date desc; on equal dates, the movement recorded last comes first. */
function sortDesc(movements: Movement[]): Movement[] {
  return [...movements].sort((a, b) =>
    a.date === b.date ? idNumber(b.id) - idNumber(a.id) : a.date < b.date ? 1 : -1
  );
}

function OriginDestination({ movement }: { movement: Movement }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{movement.origin}</span>
      <ArrowRight className="size-3.5 shrink-0 text-ink-soft" aria-label="para" />
      <span>{movement.destination}</span>
    </span>
  );
}

export function MovementHistory() {
  const movements = useHerdStore((s) => s.movements);
  const sorted = sortDesc(movements);

  return (
    <SectionCard title="Histórico de movimentações">
      {sorted.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="Nenhuma movimentação registrada"
          description="Registre compras, vendas e transferências para acompanhar as entradas e saídas do rebanho."
        />
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead>Origem → Destino</TableHead>
                  <TableHead>Obs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-ink">{formatDate(m.date)}</TableCell>
                    <TableCell>
                      <MovementTypePill type={m.type} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-ink">
                      {formatNumber(m.quantity)}
                    </TableCell>
                    <TableCell>
                      <OriginDestination movement={m} />
                    </TableCell>
                    <TableCell className="max-w-56 text-ink-soft">
                      {m.notes ? (
                        <span className="block truncate" title={m.notes}>
                          {m.notes}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: stacked cards */}
          <ul className="space-y-3 md:hidden">
            {sorted.map((m) => (
              <li key={m.id} className="rounded-lg border border-hairline bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <MovementTypePill type={m.type} />
                  <span className="font-mono text-xs text-ink-soft">
                    {formatDate(m.date)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-ink">
                  <OriginDestination movement={m} />
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  <span className="font-mono text-ink">{formatNumber(m.quantity)}</span>{" "}
                  {m.quantity === 1 ? "animal" : "animais"}
                </p>
                {m.notes ? <p className="mt-1 text-xs text-ink-soft">{m.notes}</p> : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
