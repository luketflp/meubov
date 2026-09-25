"use client";

import { useState } from "react";
import { CircleCheck } from "lucide-react";
import type { Expense } from "@/lib/types";
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
import { effectiveDueDate } from "@/lib/domain/ledger";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { LancarButton } from "@/components/finance/LancarButton";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

type Tab = "payables" | "receivables";

interface BillsCardProps {
  /** Pending despesas, oldest vencimento first. */
  payables: Expense[];
  /** Pending receitas, oldest vencimento first. */
  receivables: Expense[];
  canEdit: boolean;
}

/** "Contas": what is still to pay and to receive, ticked off the day it is settled. */
export function BillsCard({ payables, receivables, canEdit }: BillsCardProps) {
  const accounts = useHerdStore((s) => s.accounts);
  const lots = useHerdStore((s) => s.lots);
  const markExpensePaid = useHerdStore((s) => s.markExpensePaid);
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>("payables");
  // Ids being marked; their checkbox stays disabled so a double tap can't fire twice.
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const today = todayISO();

  const list = tab === "payables" ? payables : receivables;
  const total = list.reduce((sum, entry) => sum + entry.amountBrl, 0);
  const verb = tab === "payables" ? "pago" : "recebido";
  const tabs: { key: Tab; label: string }[] = [
    { key: "payables", label: `A pagar · ${payables.length}` },
    { key: "receivables", label: `A receber · ${receivables.length}` },
  ];

  async function onMark(entry: Expense) {
    if (pending.has(entry.id)) return;
    setPending((ids) => new Set(ids).add(entry.id));
    try {
      await markExpensePaid(entry.id, todayISO());
      addToast({ messageType: "success", text: `Marcado como ${verb}` });
    } catch {
      // apiFail has shown the error toast.
    } finally {
      setPending((ids) => {
        const next = new Set(ids);
        next.delete(entry.id);
        return next;
      });
    }
  }

  return (
    <SectionCard
      title="Contas"
      subtitle="vencimentos em aberto · marque quando pagar"
      action={
        <LancarButton
          size="sm"
          variant="ghost"
          defaultKind={tab === "receivables" ? "revenue" : "expense"}
        />
      }
    >
      <div className="mb-2 inline-flex items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={tab === item.key}
            onClick={() => setTab(item.key)}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-md px-3 text-[13px] whitespace-nowrap transition-colors md:min-h-8",
              tab === item.key
                ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]"
                : "text-ink-soft hover:text-ink"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Nada em aberto"
          description={
            tab === "payables"
              ? "Nenhuma despesa esperando pagamento."
              : "Nenhuma receita esperando recebimento."
          }
        />
      ) : (
        <>
          <ul>
            {list.map((entry, index) => {
              const due = effectiveDueDate(entry);
              const late = due < today;
              const group = entry.kind === "revenue" ? "revenue" : entry.category;
              const conta = accountName(entry.accountId, accounts);
              const title = conta
                ? `${ACCOUNT_GROUP_LABEL[group]} › ${conta}`
                : ACCOUNT_GROUP_LABEL[group];
              const lotName = entry.lotId
                ? lots.find((lot) => lot.id === entry.lotId)?.name
                : undefined;
              const detail = [entry.counterparty ?? entry.notes, lotName].filter(Boolean).join(" · ");
              return (
                <li
                  key={entry.id}
                  className={cn(
                    "flex min-h-12 items-center gap-1 py-1",
                    index > 0 && "border-t border-hairline"
                  )}
                >
                  <label className="-ml-3 flex size-11 shrink-0 cursor-pointer items-center justify-center has-disabled:cursor-default">
                    <input
                      type="checkbox"
                      checked={false}
                      disabled={!canEdit || pending.has(entry.id)}
                      onChange={() => onMark(entry)}
                      aria-label={`Marcar ${title} como ${verb}`}
                      className="size-4 accent-brand"
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{title}</p>
                    {detail ? <p className="mt-px truncate text-xs text-ink-soft">{detail}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 pl-2">
                    <span className="font-mono text-sm font-medium whitespace-nowrap text-ink">
                      {formatCurrency(entry.amountBrl)}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-[11px] whitespace-nowrap",
                        late ? "text-overdue" : "text-ink-soft"
                      )}
                    >
                      {late ? "venceu" : "vence"} {formatDate(due).slice(0, 5)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="-mx-4 mt-2 -mb-4 flex items-center justify-between gap-2 rounded-b-lg border-t border-hairline bg-surface px-4 py-2.5">
            <span className="text-[13px] font-semibold text-ink">
              {tab === "payables" ? "Total a pagar" : "Total a receber"}
            </span>
            <span className="font-mono text-sm font-semibold whitespace-nowrap text-ink">
              {formatCurrency(total)}
            </span>
          </div>
        </>
      )}
    </SectionCard>
  );
}
