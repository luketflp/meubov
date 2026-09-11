"use client";

/**
 * "Manejo history" section: executed batches (one row per day/type/name),
 * filterable by action; table on desktop and stacked cards on mobile,
 * always in descending order of date.
 */
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, ClipboardList } from "lucide-react";
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
  isMovementAction,
  MANEJO_ACTION_LABEL,
  MANEJO_ACTION_LIST,
  manejoHistory,
  type ManejoAction,
  type ManejoHistoryRow,
} from "@/components/manejo/helpers";
import { ManejoTypePill } from "@/components/manejo/manejo-type-pill";
import { ManejoRowMenu } from "@/components/manejo/manejo-row-menu";

const ALL = "all";

function headsLabel(session: ManejoHistoryRow): string {
  return session.headCount === 1 ? "animal" : "animais";
}

/**
 * Mobile card body: a link to the row's own screen when it has one (a venda
 * encerrada), otherwise the plain block.
 */
function Wrapper({ href, children }: { href?: string; children: ReactNode }) {
  if (!href) return <div className="p-4">{children}</div>;
  return (
    <Link href={href} className="block p-4">
      {children}
      <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand">
        Ver a venda
        <ChevronRight className="size-3.5" aria-hidden />
      </span>
    </Link>
  );
}

export function ManejoHistory() {
  const treatments = useHerdStore((s) => s.treatments);
  const animals = useHerdStore((s) => s.animals);
  const manejoSessions = useHerdStore((s) => s.manejoSessions);
  const [filter, setFilter] = useState<ManejoAction | typeof ALL>(ALL);

  const sessions = useMemo(
    () => manejoHistory(treatments, animals, manejoSessions),
    [treatments, animals, manejoSessions]
  );
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
                  <TableHead className="text-right">Custo / Valor</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Ações</span>
                  </TableHead>
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
                    <TableCell className="text-ink">
                      {session.href ? (
                        <Link
                          href={session.href}
                          className="font-medium text-brand hover:underline"
                        >
                          {session.name}
                        </Link>
                      ) : (
                        session.name
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-ink">
                      {formatNumber(session.headCount)}
                    </TableCell>
                    <TableCell className="text-ink-soft">{session.responsible ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-ink">
                      {session.amountBrl === null ? "—" : formatCurrency(session.amountBrl)}
                    </TableCell>
                    <TableCell className="text-right">
                      <ManejoRowMenu row={session} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: stacked cards */}
          <ul className="space-y-3 md:hidden">
            {filtered.map((session) => (
              <li key={session.key} className="rounded-lg border border-hairline bg-surface">
                <Wrapper href={session.href}>
                  <div className="flex items-center justify-between gap-2">
                    <ManejoTypePill action={session.kind} />
                    <span className="flex items-center gap-1">
                      <span className="font-mono text-xs text-ink-soft">
                        {formatDate(session.date)}
                      </span>
                      <ManejoRowMenu row={session} />
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-ink">{session.name}</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    <span className="font-mono text-ink">{formatNumber(session.headCount)}</span>{" "}
                    {headsLabel(session)}
                    {session.responsible ? ` · ${session.responsible}` : ""}
                  </p>
                  {session.amountBrl !== null ? (
                    <p className="mt-1 text-xs text-ink-soft">
                      {isMovementAction(session.kind) ? "Valor" : "Custo total"}:{" "}
                      <span className="font-mono text-ink">
                        {formatCurrency(session.amountBrl)}
                      </span>
                    </p>
                  ) : null}
                </Wrapper>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
