"use client";

/**
 * The Extrato on a phone: one line per row (date, conta, "grupo · quem ·
 * lote", value and status), 50 at a time with "Carregar mais". A tap opens
 * the row in a bottom sheet with its details and actions.
 */
import { useState, type ReactNode } from "react";
import type { LedgerRow } from "@/lib/domain/ledger";
import { formatDate } from "@/lib/domain/dates";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BOTTOM_SHEET } from "@/components/finance/extrato/ExtratoFilters";
import {
  LedgerAmount,
  LedgerKindPill,
  LedgerStatusPill,
} from "@/components/finance/extrato/ExtratoTable";
import { RowActions } from "@/components/finance/extrato/RowActions";

const PAGE_SIZE = 50;

function subline(row: LedgerRow): string {
  return [row.account ? row.groupLabel : null, row.counterparty, row.lotName ?? "fazenda"]
    .filter(Boolean)
    .join(" · ");
}

export function ExtratoList({ rows }: { rows: LedgerRow[] }) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  // Looked up on every render: a removed row closes its sheet.
  const open = openId === null ? null : (rows.find((row) => row.id === openId) ?? null);

  const details: [string, ReactNode][] = open
    ? [
        ["Valor", <LedgerAmount key="v" row={open} />],
        ["Tipo", <LedgerKindPill key="t" kind={open.kind} />],
        ["Status", <LedgerStatusPill key="s" status={open.status} />],
        ["Vencimento", <span key="d" className="font-mono">{formatDate(open.dueDate)}</span>],
        ["Pagamento", <span key="p" className="font-mono">{open.paidAt ? formatDate(open.paidAt) : "—"}</span>],
        ["Pago para / recebido de", open.counterparty ?? "—"],
        ["Documento", <span key="doc" className="font-mono text-xs">{open.document ?? "—"}</span>],
        ["Lote", open.lotName ?? "fazenda"],
      ]
    : [];

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-panel">
        {rows.slice(0, shown).map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => setOpenId(row.id)}
              className="grid min-h-11 w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface"
            >
              <span className="font-mono text-xs text-ink-soft">{formatDate(row.date).slice(0, 5)}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">
                  {row.account ?? row.groupLabel}
                </span>
                <span className="block truncate text-xs text-ink-soft">{subline(row)}</span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <LedgerAmount row={row} className="text-sm" />
                <LedgerStatusPill status={row.status} />
              </span>
            </button>
          </li>
        ))}
      </ul>

      {rows.length > shown ? (
        <Button variant="outline" className="min-h-11" onClick={() => setShown((n) => n + PAGE_SIZE)}>
          Carregar mais
        </Button>
      ) : null}

      <Dialog
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpenId(null);
        }}
      >
        <DialogContent className={BOTTOM_SHEET}>
          {open ? (
            <>
              <DialogHeader>
                <DialogTitle>{open.account ?? open.groupLabel}</DialogTitle>
                <DialogDescription>
                  {formatDate(open.date)} · {open.groupLabel}
                </DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                {details.map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-ink-soft">{label}</dt>
                    <dd className="text-right text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              <RowActions row={open} labeled onDone={() => setOpenId(null)} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
