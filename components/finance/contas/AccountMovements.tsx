"use client";

/**
 * "Movimentação · <conta>": the conta's lines in the window, newest first,
 * with the saldo after each one and whether an extrato line confirms it.
 * Ten per page; a table on md+, cards on the phone.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, CircleCheck, Pencil } from "lucide-react";
import type { BankAccount, Expense } from "@/lib/types";
import { accountMovements, type BankMove } from "@/lib/domain/bankAccounts";
import { accountName } from "@/lib/domain/accounts";
import { ENTRY_KIND_LABEL, entryGroup } from "@/lib/domain/entries";
import { GROUP_KIND_LABEL, groupLabel } from "@/lib/domain/groups";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import type { Period } from "@/lib/domain/period";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { PeriodPicker } from "@/components/dashboard/PeriodPicker";
import { ELLIPSIS, pageWindow, paginate } from "@/components/herd/pagination";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;
const HEAD = "px-2 py-2.5 text-left text-[11px] font-medium tracking-wide whitespace-nowrap text-ink-soft uppercase";

interface AccountMovementsProps {
  account: BankAccount;
  period: Period;
  onPeriodChange(period: Period): void;
  canEdit: boolean;
  onEdit(): void;
  /** Extra header action: "Importar extrato" on a conta corrente. */
  action?: ReactNode;
}

interface Row extends BankMove {
  description: string;
  plan: string | null;
  group: string | null;
}

export function AccountMovements({ account, period, onPeriodChange, canEdit, onEdit, action }: AccountMovementsProps) {
  const expenses = useHerdStore((s) => s.expenses);
  const movements = useHerdStore((s) => s.movements);
  const transfers = useHerdStore((s) => s.transfers);
  const accounts = useHerdStore((s) => s.accounts);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const reconciledIds = useHerdStore((s) => s.reconciledIds);
  const planGroups = useHerdStore((s) => s.planGroups);
  const [pageNumber, setPageNumber] = useState(1);

  const rows = useMemo<Row[]>(() => {
    const nameOf = (id: string) => bankAccounts.find((a) => a.id === id)?.name ?? "outra conta";
    const planOf = (e: Expense) => accountName(e.accountId, accounts);
    return accountMovements(account, { expenses, movements, transfers }, period).map((move) => {
      if (move.expense) {
        const e = move.expense;
        const groupKey = entryGroup(e);
        const group = groupKey ? groupLabel(groupKey, planGroups) : ENTRY_KIND_LABEL.yield;
        return { ...move, description: e.counterparty ?? e.notes ?? group, plan: planOf(e) ?? group, group: planOf(e) ? group : null };
      }
      if (move.movement) {
        const m = move.movement;
        const sale = m.type === "sale";
        return {
          ...move,
          description: `${sale ? "Venda" : "Compra"} · ${sale ? m.destination : m.origin}`,
          plan: sale ? "Venda de gado" : "Compra de gado",
          group: GROUP_KIND_LABEL[sale ? "revenue" : "investment"],
        };
      }
      const t = move.transfer!;
      const other = move.kind === "transferIn" ? `de ${nameOf(t.fromId)}` : `para ${nameOf(t.toId)}`;
      return { ...move, description: t.notes ?? `Transferência ${other}`, plan: "Transferência", group: other };
    });
  }, [account, expenses, movements, transfers, period, accounts, bankAccounts, planGroups]);

  const reconciledSet = useMemo(() => new Set(reconciledIds), [reconciledIds]);
  // A transferência is conciliada per side (`pairKey`).
  const isReconciled = (row: Row) => reconciledSet.has(row.transfer ? `${row.id}:${account.id}` : row.id);
  const page = paginate(rows, pageNumber, PAGE_SIZE);
  const checking = account.kind === "checking";
  const pendingCount = checking ? rows.filter((r) => !isReconciled(r)).length : 0;

  const status = (row: Row) =>
    !checking ? (
      <span className="text-xs text-ink-soft">—</span>
    ) : isReconciled(row) ? (
      <span className="inline-flex items-center gap-1.5 text-xs text-healthy">
        <CircleCheck className="size-4" aria-hidden />
        conciliado
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-xs text-attention">
        <span aria-hidden className="mx-[3px] size-2.5 rounded-full border-[1.5px] border-current" />a conciliar
      </span>
    );
  const amount = (value: number, sign: "+" | "−") => (
    <span className={cn("font-mono tabular-nums", sign === "+" ? "text-healthy" : "text-ink")}>
      {sign}
      {formatNumber(Math.abs(value), 2)}
    </span>
  );

  return (
    <SectionCard
      title={`Movimentação · ${account.name}${account.label ? ` ${account.label}` : ""}`}
      subtitle="mais recentes primeiro · o saldo acompanha cada linha"
      bodyClassName="p-0"
      action={
        <div className="flex items-center gap-1">
          {action}
          {canEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 md:size-8"
              aria-label="Editar conta"
              title="Editar conta"
              onClick={onEdit}
            >
              <Pencil aria-hidden />
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-2 border-b border-hairline px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-3">
          <span className="text-sm text-ink-soft">Período</span>
          {/* PeriodPicker is inline-flex: full width on a phone. */}
          <div className="[&>div]:flex [&>div]:w-full [&_input]:flex-1 md:[&>div]:inline-flex md:[&>div]:w-auto md:[&_input]:flex-none">
            <PeriodPicker
              value={period}
              onChange={(next) => {
                setPageNumber(1);
                onPeriodChange(next);
              }}
            />
          </div>
        </div>
        {checking ? (
          <p className="text-xs text-ink-soft">
            {formatNumber(pendingCount)} a conciliar · {formatNumber(rows.length - pendingCount)} conciliados
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-soft">Nenhuma movimentação no período.</p>
      ) : (
        <>
          <table className="hidden w-full border-collapse md:table">
            <caption className="sr-only">Movimentação da conta {account.name}</caption>
            <thead>
              <tr>
                <th scope="col" className={cn(HEAD, "w-24 pl-4")}>Data</th>
                <th scope="col" className={HEAD}>Descrição</th>
                <th scope="col" className={cn(HEAD, "w-48")}>Conta do plano</th>
                <th scope="col" className={cn(HEAD, "w-28 text-right")}>Entrada</th>
                <th scope="col" className={cn(HEAD, "w-28 text-right")}>Saída</th>
                <th scope="col" className={cn(HEAD, "w-32 text-right")}>Saldo</th>
                <th scope="col" className={cn(HEAD, "w-32 pr-4")}>Conciliação</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((row) => (
                <tr
                  key={row.id}
                  className={cn("border-t border-hairline text-sm", checking && !isReconciled(row) && "bg-attention-soft/25")}
                >
                  <td className="px-2 py-2.5 pl-4 font-mono text-xs text-ink">{formatDate(row.date)}</td>
                  <td className="px-2 py-2.5 text-ink">{row.description}</td>
                  <td className="px-2 py-2.5">
                    {row.plan ? (
                      <>
                        <span className="block font-medium text-ink">{row.plan}</span>
                        {row.group ? <span className="block text-xs text-ink-soft">{row.group}</span> : null}
                      </>
                    ) : (
                      <span className="text-[13px] text-ink-soft">sem conta</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    {row.amountBrl > 0 ? amount(row.amountBrl, "+") : <span className="text-ink-soft">—</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    {row.amountBrl < 0 ? amount(row.amountBrl, "−") : <span className="text-ink-soft">—</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono font-medium text-ink tabular-nums">
                    {formatNumber(row.balance, 2)}
                  </td>
                  <td className="px-2 py-2.5 pr-4">{status(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="divide-y divide-hairline md:hidden">
            {page.items.map((row) => (
              <li key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{row.description}</span>
                  <span className="block truncate text-xs text-ink-soft">
                    {formatDate(row.date).slice(0, 5)} · {row.plan ?? "sem conta"}
                  </span>
                </span>
                <span className="text-right text-sm">
                  {row.amountBrl > 0 ? (
                    amount(row.amountBrl, "+")
                  ) : row.amountBrl < 0 ? (
                    amount(row.amountBrl, "−")
                  ) : (
                    <span className="text-ink-soft">—</span>
                  )}
                  <span className="block font-mono text-xs text-ink-soft">{formatCurrency(row.balance)}</span>
                </span>
                <span className="col-span-2">{status(row)}</span>
              </li>
            ))}
          </ul>

          <nav
            aria-label="Paginação da movimentação"
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
                  onClick={() => setPageNumber(page.page - 1)}
                  aria-label="Página anterior"
                >
                  <ChevronLeft aria-hidden />
                </Button>
                {pageWindow(page.page, page.pageCount).map((slot, index) =>
                  slot === ELLIPSIS ? (
                    <span key={`ellipsis-${index}`} aria-hidden className="hidden w-8 text-center sm:inline">
                      …
                    </span>
                  ) : (
                    <Button
                      key={slot}
                      variant={slot === page.page ? "outline" : "ghost"}
                      size="icon"
                      className={cn("hidden font-mono sm:inline-flex", slot === page.page && "pointer-events-none text-ink")}
                      aria-current={slot === page.page ? "page" : undefined}
                      aria-label={`Página ${slot}`}
                      onClick={() => setPageNumber(slot)}
                    >
                      {formatNumber(slot)}
                    </Button>
                  )
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={page.page === page.pageCount}
                  onClick={() => setPageNumber(page.page + 1)}
                  aria-label="Próxima página"
                >
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            ) : null}
          </nav>
        </>
      )}
    </SectionCard>
  );
}
