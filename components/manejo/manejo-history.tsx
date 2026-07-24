"use client";

/**
 * "Manejo history" section: executed batches (one row per day/type/name),
 * filterable by action; table on desktop and stacked cards on mobile,
 * always in descending order of date.
 */
import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
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
import {
  MANEJO_ACTION_LABEL,
  MANEJO_ACTION_LIST,
  manejoHistory,
  type ManejoAction,
  type ManejoHistoryRow,
} from "@/components/manejo/helpers";
import { ManejoTypePill } from "@/components/manejo/manejo-type-pill";

const ALL = "all";

function headsLabel(session: ManejoHistoryRow): string {
  return session.headCount === 1 ? "animal" : "animais";
}

export function ManejoHistory() {
  const treatments = useHerdStore((s) => s.treatments);
  const animals = useHerdStore((s) => s.animals);
  const [filter, setFilter] = useState<ManejoAction | typeof ALL>(ALL);

  const sessions = useMemo(() => manejoHistory(treatments, animals), [treatments, animals]);
  const filtered = filter === ALL ? sessions : sessions.filter((s) => s.kind === filter);

  return (
    <SectionCard
      title="Histórico de manejos"
      action={
        <Select value={filter} onValueChange={(v) => setFilter(v as ManejoAction | typeof ALL)}>
          <SelectTrigger className="min-h-9" aria-label="Filtrar por tipo de manejo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os tipos</SelectItem>
            {MANEJO_ACTION_LIST.map((action) => (
              <SelectItem key={action} value={action}>
                {MANEJO_ACTION_LABEL[action]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhum manejo registrado"
          description="Registre um manejo em lote para acompanhar as aplicações e pesagens realizadas no curral."
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
                  <TableHead>Manejo</TableHead>
                  <TableHead className="text-right">Animais</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((session) => (
                  <TableRow key={session.key}>
                    <TableCell className="font-mono text-ink">
                      {formatDate(session.date)}
                    </TableCell>
                    <TableCell>
                      <ManejoTypePill action={session.kind} />
                    </TableCell>
                    <TableCell className="text-ink">{session.name}</TableCell>
                    <TableCell className="text-right font-mono text-ink">
                      {formatNumber(session.headCount)}
                    </TableCell>
                    <TableCell className="text-ink-soft">{session.responsible ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-ink">
                      {session.totalCostBrl === null ? "—" : formatCurrency(session.totalCostBrl)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: stacked cards */}
          <ul className="space-y-3 md:hidden">
            {filtered.map((session) => (
              <li key={session.key} className="rounded-lg border border-hairline bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <ManejoTypePill action={session.kind} />
                  <span className="font-mono text-xs text-ink-soft">
                    {formatDate(session.date)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-ink">{session.name}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  <span className="font-mono text-ink">{formatNumber(session.headCount)}</span>{" "}
                  {headsLabel(session)}
                  {session.responsible ? ` · ${session.responsible}` : ""}
                </p>
                {session.totalCostBrl !== null ? (
                  <p className="mt-1 text-xs text-ink-soft">
                    Custo total:{" "}
                    <span className="font-mono text-ink">
                      {formatCurrency(session.totalCostBrl)}
                    </span>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
