"use client";

/**
 * The Extrato on md+: one table row per ledger row, 50 per page, with the
 * pager in the card's footer. Also exports the Tipo and Status pills and the
 * signed value, which the phone list reuses.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { LedgerKind, LedgerRow, LedgerStatus } from "@/lib/domain/ledger";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { ELLIPSIS, pageWindow, type Page } from "@/components/herd/pagination";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RowActions } from "@/components/finance/extrato/RowActions";
import { cn } from "@/lib/utils";

const PILL =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";

const KIND_PILL: Record<LedgerKind, { label: string; className: string }> = {
  expense: { label: "despesa", className: "bg-surface text-ink-soft" },
  revenue: { label: "receita", className: "bg-healthy-soft text-healthy" },
  sale: { label: "venda", className: "bg-brand-soft text-brand" },
  purchase: { label: "compra", className: "bg-scheduled-soft text-scheduled" },
  treatment: { label: "tratamento", className: "bg-fmd-soft text-fmd" },
};

const STATUS_PILL: Record<LedgerStatus, { label: string; className: string }> = {
  paid: { label: "pago", className: "bg-healthy-soft text-healthy" },
  received: { label: "recebido", className: "bg-healthy-soft text-healthy" },
  payable: { label: "a pagar", className: "bg-attention-soft text-attention" },
  receivable: { label: "a receber", className: "bg-scheduled-soft text-scheduled" },
  overdue: { label: "vencida", className: "bg-overdue-soft text-overdue" },
};

export function LedgerKindPill({ kind }: { kind: LedgerKind }) {
  const pill = KIND_PILL[kind];
  return <span className={cn(PILL, pill.className)}>{pill.label}</span>;
}

export function LedgerStatusPill({ status }: { status: LedgerStatus }) {
  const pill = STATUS_PILL[status];
  return (
    <span className={cn(PILL, pill.className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {pill.label}
    </span>
  );
}

/** Receitas and vendas come in: "+" and healthy. */
export function LedgerAmount({ row, className }: { row: LedgerRow; className?: string }) {
  const incoming = row.kind === "revenue" || row.kind === "sale";
  return (
    <span
      className={cn(
        "font-mono whitespace-nowrap tabular-nums",
        incoming ? "text-healthy" : "text-ink",
        className
      )}
    >
      {incoming ? "+" : ""}
      {formatCurrency(row.amountBrl)}
    </span>
  );
}

const HEAD = "text-[11px] font-medium tracking-wide text-ink-soft uppercase";

interface ExtratoTableProps {
  page: Page<LedgerRow>;
  onPageChange: (page: number) => void;
}

export function ExtratoTable({ page, onPageChange }: ExtratoTableProps) {
  return (
    <SectionCard
      title="Lançamentos"
      subtitle="mais recentes primeiro · vendas e compras vêm dos manejos"
      bodyClassName="p-0"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={cn(HEAD, "pl-4")}>Data</TableHead>
            <TableHead className={HEAD}>Vencimento</TableHead>
            <TableHead className={HEAD}>Tipo</TableHead>
            <TableHead className={HEAD}>Grupo › Conta</TableHead>
            <TableHead className={cn(HEAD, "whitespace-normal")}>Pago para / Recebido de</TableHead>
            <TableHead className={HEAD}>Documento</TableHead>
            <TableHead className={HEAD}>Lote</TableHead>
            <TableHead className={cn(HEAD, "text-right")}>Valor</TableHead>
            <TableHead className={HEAD}>Status</TableHead>
            <TableHead className={cn(HEAD, "pr-4 text-right")}>Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.items.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="pl-4 font-mono text-xs text-ink">{formatDate(row.date)}</TableCell>
              <TableCell className="font-mono text-xs text-ink-soft">{formatDate(row.dueDate)}</TableCell>
              <TableCell>
                <LedgerKindPill kind={row.kind} />
              </TableCell>
              <TableCell className="min-w-36 whitespace-normal">
                <span className="block font-medium text-ink">{row.account ?? row.groupLabel}</span>
                {row.account ? (
                  <span className="block text-xs text-ink-soft">{row.groupLabel}</span>
                ) : null}
              </TableCell>
              <TableCell className="max-w-44 whitespace-normal text-ink">{row.counterparty ?? "—"}</TableCell>
              <TableCell className="max-w-36 font-mono text-xs whitespace-normal text-ink">
                {row.document ?? "—"}
              </TableCell>
              <TableCell>
                {row.lotName ? (
                  <span className="text-ink">{row.lotName}</span>
                ) : (
                  <span className="text-xs text-ink-soft">fazenda</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <LedgerAmount row={row} />
              </TableCell>
              <TableCell>
                <LedgerStatusPill status={row.status} />
              </TableCell>
              <TableCell className="pr-4 text-right">
                <RowActions row={row} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <nav
        aria-label="Paginação"
        className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3 text-sm text-ink-soft"
      >
        <span aria-live="polite">
          Mostrando {formatNumber(page.from)}–{formatNumber(page.to)} de {formatNumber(page.total)}
        </span>
        {page.pageCount > 1 ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              disabled={page.page === 1}
              onClick={() => onPageChange(page.page - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeft aria-hidden />
            </Button>
            {pageWindow(page.page, page.pageCount).map((slot, index) =>
              slot === ELLIPSIS ? (
                <span key={`ellipsis-${index}`} aria-hidden className="w-8 text-center">
                  …
                </span>
              ) : (
                <Button
                  key={slot}
                  variant={slot === page.page ? "outline" : "ghost"}
                  size="icon"
                  className={cn("font-mono", slot === page.page && "pointer-events-none text-ink")}
                  aria-current={slot === page.page ? "page" : undefined}
                  aria-label={`Página ${slot}`}
                  onClick={() => onPageChange(slot)}
                >
                  {formatNumber(slot)}
                </Button>
              )
            )}
            <Button
              variant="ghost"
              size="icon"
              disabled={page.page === page.pageCount}
              onClick={() => onPageChange(page.page + 1)}
              aria-label="Próxima página"
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
        ) : null}
      </nav>
    </SectionCard>
  );
}
