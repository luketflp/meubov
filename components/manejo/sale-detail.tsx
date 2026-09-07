"use client";

/**
 * Venda record: the read-only romaneio of a sale already closed at the chute.
 * The summary card holds the batch arithmetic; below it, one line per animal
 * with the weight read on the scale, its carcass arrobas and what it was worth.
 * A venda still running belongs to the chute screen, which keeps the actions.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardX, Search } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { formatDate } from "@/lib/domain/dates";
import { formatArroba, formatCurrency, formatKg } from "@/lib/domain/format";
import { saleRows, type SaleRow } from "@/lib/domain/movements";
import { movementSubtitle } from "@/components/manejo/helpers";
import { SaleSummaryCard } from "@/components/manejo/sale-summary";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SaleDetailProps {
  sessionId: string;
}

/** Link back to the Manejo screen, in the page header and on the dead ends. */
function BackLink({ className }: { className?: string }) {
  return (
    <Link
      href="/manejo"
      className={
        className ??
        "inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
      }
    >
      <ArrowLeft className="size-4" aria-hidden />
      Voltar ao manejo
    </Link>
  );
}

export function SaleDetail({ sessionId }: SaleDetailProps) {
  const session = useHerdStore((s) => s.manejoSessions.find((m) => m.id === sessionId));
  const [search, setSearch] = useState("");

  const rows = useMemo(() => (session ? saleRows(session) : []), [session]);

  if (!session) {
    return (
      <SectionCard title="Venda não encontrada">
        <EmptyState
          icon={ClipboardX}
          title="Venda inexistente"
          description="Esta venda não existe ou ainda não foi carregada."
        />
        <div className="mt-3">
          <BackLink />
        </div>
      </SectionCard>
    );
  }

  if (session.kind !== "sale") {
    return (
      <SectionCard title="Este manejo não é uma venda">
        <EmptyState
          icon={ClipboardX}
          title="Manejo de outro tipo"
          description="Só uma venda tem romaneio. Abra este manejo pela tela do brete."
        />
        <div className="mt-3 flex flex-wrap gap-4">
          <Link
            href={`/manejo/${session.id}`}
            className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline md:min-h-0"
          >
            Abrir o manejo
          </Link>
          <BackLink />
        </div>
      </SectionCard>
    );
  }

  if (session.status === "open") {
    return (
      <SectionCard title="Venda em andamento">
        <EmptyState
          icon={ClipboardX}
          title="A venda ainda está no brete"
          description="O romaneio fica pronto quando a venda for encerrada. Continue passando os animais para fechá-la."
        />
        <div className="mt-3 flex flex-wrap gap-4">
          <Link
            href={`/manejo/${session.id}`}
            className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline md:min-h-0"
          >
            Continuar no brete
          </Link>
          <BackLink />
        </div>
      </SectionCard>
    );
  }

  const perArroba = session.pricePerArroba !== undefined;
  // A venda closed at one price has no per-head money: the column would be a
  // stack of dashes, so it only shows when some animal carries a value.
  const priced = rows.some((row) => row.amountBrl !== null);
  const term = search.trim().toLowerCase();
  const visible =
    term === "" ? rows : rows.filter((r) => r.earTag.toLowerCase().includes(term));

  return (
    <div className="space-y-6">
      <PageHeader
        title={session.name}
        subtitle={`${formatDate(session.date)} · ${movementSubtitle(session, undefined)}`}
        actions={<BackLink />}
      />

      <SaleSummaryCard session={session} />

      <SectionCard
        title={`Animais (${rows.length})`}
        action={
          rows.length > 0 ? (
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar brinco"
                aria-label="Buscar animal da venda por brinco"
                className="min-h-11 pl-9 font-mono md:min-h-9"
              />
            </div>
          ) : undefined
        }
      >
        {rows.length === 0 ? (
          <p className="py-1 text-xs text-ink-soft">Nenhum animal nesta venda.</p>
        ) : visible.length === 0 ? (
          <p className="py-1 text-xs text-ink-soft">Nenhum brinco corresponde à busca.</p>
        ) : (
          <>
            {/* Desktop: table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brinco</TableHead>
                    <TableHead className="text-right">Peso</TableHead>
                    {perArroba ? <TableHead className="text-right">@ carcaça</TableHead> : null}
                    {priced ? <TableHead className="text-right">Valor</TableHead> : null}
                    <TableHead>Observação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow key={row.earTag}>
                      <TableCell className="font-mono font-medium text-ink">
                        {row.earTag}
                      </TableCell>
                      <TableCell className="text-right font-mono text-ink">
                        {row.weightKg === null ? "—" : formatKg(row.weightKg)}
                      </TableCell>
                      {perArroba ? (
                        <TableCell className="text-right font-mono text-ink">
                          {row.carcassArrobas === null
                            ? "—"
                            : formatArroba(row.carcassArrobas)}
                        </TableCell>
                      ) : null}
                      {priced ? (
                        <TableCell className="text-right font-mono text-ink">
                          {row.amountBrl === null ? "—" : formatCurrency(row.amountBrl)}
                        </TableCell>
                      ) : null}
                      <TableCell className="text-ink-soft">{rowNote(row)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile: stacked cards */}
            <ul className="space-y-3 md:hidden">
              {visible.map((row) => (
                <li
                  key={row.earTag}
                  className="rounded-lg border border-hairline bg-surface p-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-sm font-medium text-ink">
                      {row.earTag}
                    </span>
                    {priced ? (
                      <span className="font-mono text-sm text-ink">
                        {row.amountBrl === null ? "—" : formatCurrency(row.amountBrl)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    {row.weightKg === null ? "sem peso" : formatKg(row.weightKg)}
                    {perArroba && row.carcassArrobas !== null
                      ? ` · ${formatArroba(row.carcassArrobas)} de carcaça`
                      : ""}
                  </p>
                  {rowNote(row) ? (
                    <p className="mt-1 text-xs text-ink-soft">{rowNote(row)}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </SectionCard>
    </div>
  );
}

/** Note shown for an animal: its own, prefixed by "pulado" when it did not pass. */
function rowNote(row: SaleRow): string {
  if (row.outcome === "done") return row.notes ?? "";
  const label = row.outcome === "skipped" ? "pulado" : "não passou";
  return row.notes ? `${label} · ${row.notes}` : label;
}
