"use client";

/**
 * /finance/contas: how much money the farm has in each conta and aplicação
 * today, what is owed on each cartão, and the movimentação of the conta
 * picked. An aplicação earns by "Lançar rendimento" and takes no extrato.
 * The window (?de&ate) follows the Financeiro sub-navigation.
 */
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, Landmark, Plus, TrendingUp, Upload } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { accountBalance, bankTotal, faturaOf } from "@/lib/domain/bankAccounts";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { periodFromSearch, periodSearch, type Period } from "@/lib/domain/period";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { FinanceSubnav } from "@/components/finance/FinanceSubnav";
import { EntryDialog } from "@/components/finance/EntryDialog";
import { AccountCard } from "@/components/finance/contas/AccountCard";
import { AccountMovements } from "@/components/finance/contas/AccountMovements";
import { BankAccountDialog } from "@/components/finance/contas/BankAccountDialog";
import { ImportDialog } from "@/components/finance/contas/ImportDialog";
import { TransferDialog } from "@/components/finance/contas/TransferDialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export function ContasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canEdit = useCan("finance", "edit");
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const expenses = useHerdStore((s) => s.expenses);
  const movements = useHerdStore((s) => s.movements);
  const transfers = useHerdStore((s) => s.transfers);
  const today = todayISO();

  const period = useMemo(() => periodFromSearch(searchParams, today), [searchParams, today]);
  const setPeriod = (next: Period) => router.replace(`/finance/contas?${periodSearch(next)}`, { scroll: false });

  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"new" | "edit" | "transfer" | "import" | "yield" | null>(null);

  const inputs = useMemo(() => ({ expenses, movements, transfers }), [expenses, movements, transfers]);
  const active = bankAccounts.filter((a) => a.archivedAt === undefined);
  const archived = bankAccounts.filter((a) => a.archivedAt !== undefined);
  const shown = [...active, ...(showArchived ? archived : [])].sort(
    (a, b) => Number(b.isMain) - Number(a.isMain) || Number(a.kind === "card") - Number(b.kind === "card")
  );
  const selected = shown.find((a) => a.id === selectedId) ?? shown[0];
  const total = bankTotal(bankAccounts, inputs, today);
  // "Saldo em contas" (bankTotal) takes contas correntes, caixas and aplicações; cartões stay out.
  const holding = active.filter((a) => a.kind === "checking" || a.kind === "cash").length;
  const applications = active.filter((a) => a.kind === "investment").length;

  const header = (
    <PageHeader
      title="Contas bancárias"
      subtitle={`Saldos de hoje, ${formatDate(today)} · o extrato do banco confere os lançamentos`}
      badges={canEdit ? undefined : <ReadOnlyPill />}
      actions={
        canEdit ? (
          <>
            {active.length > 1 ? (
              <Button variant="outline" className="min-h-11 md:min-h-9" onClick={() => setDialog("transfer")}>
                <ArrowLeftRight aria-hidden />
                Transferir
              </Button>
            ) : null}
            <Button className="min-h-11 md:min-h-9" onClick={() => setDialog("new")}>
              <Plus aria-hidden />
              Nova conta
            </Button>
          </>
        ) : null
      }
    />
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 pb-16 md:px-8 md:pb-6">
      {header}
      <FinanceSubnav current="contas" period={period} />

      {bankAccounts.length === 0 ? (
        <section className="flex flex-col items-center rounded-lg border border-hairline bg-panel pb-8">
          <EmptyState
            icon={Landmark}
            title="Cadastre a primeira conta"
            description="A conta do banco, o caixa em dinheiro, o cartão e a aplicação: o saldo de cada uma aparece aqui e o extrato do banco confere os lançamentos."
            className="pb-4"
          />
          {canEdit ? (
            <Button className="min-h-11 md:min-h-9" onClick={() => setDialog("new")}>
              <Plus aria-hidden />
              Nova conta
            </Button>
          ) : null}
        </section>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface px-4 py-3 md:flex-row md:items-end md:justify-between md:border-0 md:bg-transparent md:p-0">
              <div>
                <p className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">Saldo em contas</p>
                <p className="mt-0.5 font-mono text-[22px] font-medium text-ink md:text-2xl">{formatCurrency(total)}</p>
              </div>
              <p className="text-xs text-ink-soft">
                {formatNumber(holding)} {holding === 1 ? "conta" : "contas"}
                {applications > 0
                  ? ` e ${formatNumber(applications)} ${applications === 1 ? "aplicação" : "aplicações"}`
                  : null}{" "}
                · a fatura do cartão fica fora do saldo até ser paga
              </p>
            </div>
            <div role="group" aria-label="Contas" className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 lg:grid-cols-4">
              {shown.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  value={accountBalance(account, inputs, today)}
                  due={account.kind === "card" ? faturaOf(account, today).due : undefined}
                  selected={account.id === selected?.id}
                  onSelect={() => setSelectedId(account.id)}
                />
              ))}
            </div>
            {archived.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="inline-flex min-h-11 items-center self-start text-xs font-medium text-brand hover:underline md:min-h-0"
              >
                {showArchived ? "Esconder arquivadas" : `Ver arquivadas (${archived.length})`}
              </button>
            ) : null}
          </div>

          {selected ? (
            <AccountMovements
              key={selected.id}
              account={selected}
              period={period}
              onPeriodChange={setPeriod}
              canEdit={canEdit}
              onEdit={() => setDialog("edit")}
              action={
                !canEdit || selected.archivedAt !== undefined ? undefined : selected.kind === "checking" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11 md:min-h-8"
                    aria-label="Importar extrato (OFX/CSV)"
                    onClick={() => setDialog("import")}
                  >
                    <Upload aria-hidden />
                    {/* The phone keeps the card's title readable: the icon says it. */}
                    <span className="hidden sm:inline">Importar extrato (OFX/CSV)</span>
                  </Button>
                ) : selected.kind === "investment" ? (
                  // An aplicação has no extrato: it earns by rendimento.
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11 md:min-h-8"
                    aria-label="Lançar rendimento"
                    onClick={() => setDialog("yield")}
                  >
                    <TrendingUp aria-hidden />
                    <span className="hidden sm:inline">Lançar rendimento</span>
                  </Button>
                ) : undefined
              }
            />
          ) : null}
        </>
      )}

      {dialog === "new" ? <BankAccountDialog open onOpenChange={() => setDialog(null)} /> : null}
      {dialog === "edit" && selected ? (
        <BankAccountDialog open onOpenChange={() => setDialog(null)} account={selected} />
      ) : null}
      {dialog === "import" && selected ? (
        <ImportDialog account={selected} onOpenChange={() => setDialog(null)} />
      ) : null}
      {dialog === "transfer" ? (
        <TransferDialog open onOpenChange={() => setDialog(null)} defaultFromId={selected?.id} />
      ) : null}
      {dialog === "yield" && selected ? (
        <EntryDialog open onOpenChange={() => setDialog(null)} initial={{ kind: "yield", bankAccountId: selected.id }} />
      ) : null}
    </div>
  );
}
