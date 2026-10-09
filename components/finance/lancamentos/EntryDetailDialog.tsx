"use client";

/**
 * One lançamento in full, opened by a click on its row (a tap on the phone,
 * where it rises as a sheet): what it was and for whom, the value and where it
 * stands, every field of the row, its parcelas, observação and anexos, and the
 * toolbar's actions that apply to it. A row the manejos wrote takes only its
 * conta bancária and says so.
 */
import {
  ArrowLeftRight,
  Banknote,
  Beef,
  Ellipsis,
  HandCoins,
  Lock,
  Paperclip,
  PiggyBank,
  Printer,
  Receipt,
  Tractor,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { LedgerKind, LedgerRow } from "@/lib/domain/ledger";
import type { PaneRow, PlanNode } from "@/lib/domain/planTree";
import { daysBetween, formatDate, todayISO } from "@/lib/domain/dates";
import { ENTRY_KIND_LABEL } from "@/lib/domain/entries";
import { formatCurrency } from "@/lib/domain/format";
import { paneExportTable } from "@/lib/export/datasets/finance";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { usePrintStore } from "@/lib/store/usePrintStore";
import { useExportContext } from "@/components/export/useExportContext";
import { InstallmentChip, RecurrenceTag } from "@/components/finance/SeriesMarkers";
import { LedgerStatusPill } from "@/components/finance/lancamentos/pills";
import { useEntryActions, type EntryAction } from "@/components/finance/lancamentos/useEntryActions";
import { BOTTOM_SHEET } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<LedgerKind, LucideIcon> = {
  expense: Receipt,
  revenue: Banknote,
  investment: Tractor,
  financing: HandCoins,
  partners: Users,
  yield: PiggyBank,
  sale: Banknote,
  purchase: Beef,
};

const KIND_LABEL: Record<LedgerKind, string> = {
  ...ENTRY_KIND_LABEL,
  sale: "Venda de gado",
  purchase: "Compra de gado",
};

const inDays = (n: number) => (n === 1 ? "1 dia" : `${n} dias`);

/** "pago em 10/09/2026", "vence 10/10/2026 · em 4 dias", "venceu 10/09/2026 · há 3 dias". */
export function dueText(ledger: Pick<LedgerRow, "status" | "inflow" | "dueDate" | "paidAt">, today: string): string {
  if (ledger.status === "paid" || ledger.status === "received") {
    return `${ledger.inflow ? "recebido" : "pago"} em ${formatDate(ledger.paidAt ?? ledger.dueDate)}`;
  }
  const ahead = daysBetween(today, ledger.dueDate);
  if (ahead < 0) return `venceu ${formatDate(ledger.dueDate)} · há ${inDays(-ahead)}`;
  return `vence ${formatDate(ledger.dueDate)} · ${ahead === 0 ? "hoje" : `em ${inDays(ahead)}`}`;
}

function Fact({ label, value, mono = false, wide = false }: { label: string; value: string | null; mono?: boolean; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <dt className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">{label}</dt>
      <dd className={cn("mt-0.5 truncate text-sm", value ? "text-ink" : "text-ink-soft", mono && value && "font-mono tabular-nums")}>
        {value ?? "—"}
      </dd>
    </div>
  );
}

/** The parcelas of the row's parcelamento, paid ones filled and this one ringed. */
function Installments({ row }: { row: LedgerRow }) {
  const expenses = useHerdStore((s) => s.expenses);
  const expense = row.expense;
  if (!expense?.seriesId || !expense.seriesCount) return null;
  const parcelas = expenses
    .filter((e) => e.seriesId === expense.seriesId)
    .sort((a, b) => (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0));
  if (parcelas.length < 2) return null;
  const paid = parcelas.filter((e) => e.paidAt);
  const total = parcelas.reduce((sum, e) => sum + e.amountBrl, 0);
  const paidTotal = paid.reduce((sum, e) => sum + e.amountBrl, 0);
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">Parcelamento</span>
        <span className="text-xs text-ink-soft">
          <span className="font-mono font-medium text-ink">
            {paid.length} de {parcelas.length}
          </span>{" "}
          pagas · <span className="font-mono text-ink">{formatCurrency(paidTotal)}</span> de{" "}
          <span className="font-mono">{formatCurrency(total)}</span>
        </span>
      </div>
      <ol aria-label="Parcelas" className="flex gap-1">
        {parcelas.map((e) => {
          const me = e.id === expense.id;
          return (
            <li key={e.id} className="flex min-w-0 flex-1 flex-col gap-1">
              <span
                aria-hidden
                className={cn(
                  "h-1.5 rounded-full",
                  e.paidAt ? "bg-healthy" : me ? "bg-attention-soft ring-[1.5px] ring-attention ring-inset" : "bg-surface ring-1 ring-hairline ring-inset"
                )}
              />
              <span
                className={cn(
                  "hidden font-mono text-[11px] leading-[14px] md:block",
                  me ? "font-medium text-attention" : "text-ink-soft"
                )}
              >
                {formatDate(e.dueDate ?? e.date).slice(0, 5)}
              </span>
              <span className="sr-only">
                parcela {e.seriesIndex}, {e.paidAt ? "paga" : "a pagar"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

interface EntryDetailDialogProps {
  /** The row clicked; null keeps the dialog closed. */
  row: PaneRow | null;
  node: PlanNode;
  onOpenChange(open: boolean): void;
}

export function EntryDetailDialog({ row, node, onOpenChange }: EntryDetailDialogProps) {
  const { actions, dialogs } = useEntryActions(row, node, () => onOpenChange(false));
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const print = usePrintStore((s) => s.print);
  const exportContext = useExportContext();

  const ledger = row?.ledger ?? null;
  const expense = ledger?.expense ?? null;
  const inflow = row ? row.amountBrl > 0 : false;
  const Icon = ledger ? KIND_ICON[ledger.kind] : ArrowLeftRight;
  const bank = ledger?.bankAccountId ? (bankAccounts.find((a) => a.id === ledger.bankAccountId)?.name ?? null) : null;
  // Who and which document, under the title, when the histórico is not already one of them.
  const sub = row ? [ledger?.counterparty, ledger?.document].filter((t) => t && t !== row.history).join(" · ") : "";

  const onPrint = () => {
    if (!row) return;
    print({ title: row.history, tables: [paneExportTable([row], row.history)], context: exportContext() });
  };

  // The footer's order on desktop; the phone keeps the first two and folds the rest into "⋯".
  const secondary: EntryAction[] = [actions.duplicate, actions.split, actions.account, actions.attachments].filter(
    (a) => a.enabled
  );

  return (
    <>
      <Dialog open={row !== null} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            BOTTOM_SHEET,
            "max-h-[92dvh] gap-5 overflow-y-auto p-5 md:top-1/2 md:bottom-auto md:left-1/2 md:max-w-[680px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:p-6"
          )}
        >
          {row ? (
            <>
              <div className="flex items-start gap-3 pr-8">
                <span
                  aria-hidden
                  className="hidden size-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand md:flex"
                >
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-ink-soft">
                    {ledger ? [ledger.groupLabel, ledger.account].filter(Boolean).join(" › ") : "Transferência"}
                  </p>
                  <DialogTitle className="mt-0.5 font-heading text-xl leading-7 font-semibold md:text-[22px]">
                    {row.history}
                  </DialogTitle>
                  <DialogDescription className={cn("mt-0.5 text-sm text-ink-soft", !sub && "sr-only")}>
                    {sub || (ledger ? KIND_LABEL[ledger.kind] : "Transferência entre contas")}
                  </DialogDescription>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface px-4 py-3.5 md:flex-row md:items-center md:justify-between">
                <div>
                  <span className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">Valor</span>
                  <p
                    className={cn(
                      "font-mono text-[26px] leading-8 font-medium tabular-nums md:text-3xl md:leading-9",
                      inflow ? "text-healthy" : "text-ink"
                    )}
                  >
                    {formatCurrency(Math.abs(row.amountBrl))}
                  </p>
                </div>
                {ledger ? (
                  <div className="flex flex-col gap-1.5 md:items-end">
                    <div className="flex flex-wrap items-center gap-2">
                      <LedgerStatusPill status={ledger.status} />
                      <span
                        className={cn(
                          "text-[13px]",
                          ledger.status === "overdue"
                            ? "text-overdue"
                            : ledger.paidAt === null
                              ? "text-attention"
                              : "text-ink-soft"
                        )}
                      >
                        {dueText(ledger, todayISO())}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <InstallmentChip expense={expense} />
                      <RecurrenceTag expense={expense} />
                      <span className="rounded-md bg-scheduled-soft px-2 py-0.5 text-[11px] font-medium text-scheduled">
                        {KIND_LABEL[ledger.kind]}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              {ledger ? (
                <dl className="grid grid-cols-2 gap-x-5 gap-y-3.5 md:grid-cols-3">
                  <Fact label="Histórico" value={expense?.history ?? null} wide />
                  <Fact label={inflow ? "Recebido de" : "Pago para"} value={ledger.counterparty} />
                  <Fact label="Data" value={formatDate(ledger.date)} mono />
                  <Fact label="Vencimento" value={formatDate(ledger.dueDate)} mono />
                  <Fact label={inflow ? "Recebido em" : "Pago em"} value={ledger.paidAt ? formatDate(ledger.paidAt) : null} mono />
                  <Fact label="Conta" value={ledger.account ?? ledger.groupLabel} />
                  <Fact label="Centro de custo" value={ledger.lotName ?? (expense?.kind === "expense" ? "Fazenda toda" : null)} />
                  <Fact label={inflow ? "Recebido na" : "Pago por"} value={bank} />
                  <Fact label="Documento" value={ledger.document} mono />
                </dl>
              ) : (
                <dl className="grid grid-cols-2 gap-x-5 gap-y-3.5">
                  <Fact label="Data" value={formatDate(row.date)} mono />
                  <Fact label={inflow ? "De" : "Para"} value={row.contra} />
                </dl>
              )}

              {ledger ? <Installments row={ledger} /> : null}

              {ledger?.notes && ledger.notes !== row.history ? (
                <div className="grid gap-1">
                  <span className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">Observação</span>
                  <p className="text-sm whitespace-pre-line text-ink">{ledger.notes}</p>
                </div>
              ) : null}

              {actions.attachments.enabled ? (
                <div className="flex items-center justify-between gap-3 rounded-[10px] border border-hairline px-3 py-2">
                  <span className="flex items-center gap-2 text-sm text-ink">
                    <Paperclip className="size-4 text-ink-soft" aria-hidden />
                    {expense?.attachmentCount === 1 ? "1 anexo" : `${expense?.attachmentCount} anexos`}
                  </span>
                  <Button variant="ghost" size="sm" className="min-h-11 text-brand md:min-h-0" onClick={actions.attachments.run}>
                    Ver anexos
                  </Button>
                </div>
              ) : null}

              {ledger?.locked ? (
                <p className="flex items-center gap-2 text-sm text-ink-soft">
                  <Lock className="size-4 shrink-0" aria-hidden />
                  Vendas e compras vêm dos manejos: aqui só muda a conta.
                </p>
              ) : null}

              {/* Desktop: every action in one row, Excluir apart on the left. */}
              <div className="-mx-6 -mb-6 hidden items-center gap-2 rounded-b-2xl border-t border-hairline bg-surface/60 px-6 py-3 md:flex">
                {actions.remove.enabled ? (
                  <Button variant="ghost" className="text-overdue hover:text-overdue" onClick={actions.remove.run}>
                    <actions.remove.icon data-icon="inline-start" aria-hidden />
                    Excluir
                  </Button>
                ) : null}
                <span className="flex-1" />
                <Button variant="ghost" size="icon" aria-label="Imprimir" title="Imprimir" onClick={onPrint}>
                  <Printer aria-hidden />
                </Button>
                {secondary
                  .filter((a) => a !== actions.attachments)
                  .map((a) => (
                    <Button key={a.label} variant="outline" onClick={a.run}>
                      <a.icon data-icon="inline-start" aria-hidden />
                      {a.label}
                    </Button>
                  ))}
                {actions.edit.enabled ? (
                  <Button variant="outline" onClick={actions.edit.run}>
                    <actions.edit.icon data-icon="inline-start" aria-hidden />
                    Editar
                  </Button>
                ) : null}
                {actions.markPaid.enabled ? (
                  <Button onClick={actions.markPaid.run}>
                    <actions.markPaid.icon data-icon="inline-start" aria-hidden />
                    {actions.markPaid.label}
                  </Button>
                ) : null}
              </div>

              {/* Phone: the main action and Editar at hand, the rest under "⋯". */}
              <div className="sticky -bottom-5 -mx-5 -mb-5 flex gap-2 border-t border-hairline bg-panel px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden">
                {actions.markPaid.enabled ? (
                  <Button className="min-h-12 flex-1" onClick={actions.markPaid.run}>
                    <actions.markPaid.icon data-icon="inline-start" aria-hidden />
                    {actions.markPaid.label}
                  </Button>
                ) : null}
                {actions.edit.enabled ? (
                  <Button variant="outline" className={cn("min-h-12", !actions.markPaid.enabled && "flex-1")} onClick={actions.edit.run}>
                    <actions.edit.icon data-icon="inline-start" aria-hidden />
                    Editar
                  </Button>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Mais ações"
                      className={cn("size-12", !actions.markPaid.enabled && !actions.edit.enabled && "flex-1")}
                    >
                      <Ellipsis aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-48">
                    {secondary.map((a) => (
                      <DropdownMenuItem key={a.label} onSelect={a.run}>
                        <a.icon aria-hidden />
                        {a.label}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem onSelect={onPrint}>
                      <Printer aria-hidden />
                      Imprimir
                    </DropdownMenuItem>
                    {actions.remove.enabled ? (
                      <DropdownMenuItem variant="destructive" onSelect={actions.remove.run}>
                        <actions.remove.icon aria-hidden />
                        Excluir
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      {dialogs}
    </>
  );
}
