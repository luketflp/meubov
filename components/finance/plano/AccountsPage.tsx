"use client";

/**
 * /settings/plano-de-contas: the farm's contas inside the fixed grupos.
 * Receitas (Venda de gado is automatic, from the manejos) and Fora do
 * resultado (Investimentos with the automatic Compra de gado, Financiamentos,
 * Sócios) on the left, Despesas (COE) on the right, one block per grupo. A
 * conta shows its last 12 months and lançamento count; a financiamento shows
 * its saldo devedor today instead, its saldo inicial under the name, and
 * edits the saldo inicial beside the name. A conta is never deleted:
 * archiving hides it from the form and keeps history.
 */
import { useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, ArrowLeft, Info, Pencil, Plus, Sparkles } from "lucide-react";
import type { Account, AccountGroup, ExpenseCategory } from "@/lib/types";
import { ACCOUNT_GROUP_LABEL, EXPENSE_GROUPS, accountsByGroup } from "@/lib/domain/accounts";
import { CAPITAL_GROUPS, isCapitalKind, isInflow } from "@/lib/domain/entries";
import { debtBalance } from "@/lib/domain/planTree";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { defaultPeriod, inPeriod } from "@/lib/domain/period";
import { cn } from "@/lib/utils";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { useToast } from "@/components/providers/Toasts";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import {
  NewAccountDialog,
  openingFromFields,
  type AccountPlace,
} from "@/components/finance/plano/NewAccountDialog";

/** Where the app writes into a grupo by itself, or what a grupo holds. */
const GROUP_HINT: Partial<Record<AccountGroup, string>> = {
  health: "Tratamentos com custo entram aqui sozinhos",
  breeding: "Compras de sêmen entram aqui sozinhas",
  investment: "Benfeitorias, máquinas e equipamentos",
  financing: "Empréstimos, financiamentos e consórcios",
  partners: "Retiradas, distribuição de lucro e aportes",
};

interface AccountStats {
  /** Last 12 months, a venda do bem or an aporte taken off; a financiamento's saldo devedor today. */
  amount: number;
  count: number;
}

export function AccountsPage() {
  const accounts = useHerdStore((s) => s.accounts);
  const expenses = useHerdStore((s) => s.expenses);
  const seedDefaultAccounts = useHerdStore((s) => s.seedDefaultAccounts);
  const canEdit = useCan("finance", "edit");
  const { addToast } = useToast();
  const [adding, setAdding] = useState<{ place: AccountPlace; category?: ExpenseCategory } | null>(null);

  const today = todayISO();
  const window12m = defaultPeriod(today);
  const stats = new Map<string, AccountStats>();
  for (const e of expenses) {
    if (!e.accountId) continue;
    const s = stats.get(e.accountId) ?? { amount: 0, count: 0 };
    if (!inPeriod(e.date, window12m)) continue;
    s.count += 1;
    s.amount += isCapitalKind(e.kind) && isInflow(e) ? -e.amountBrl : e.amountBrl;
    stats.set(e.accountId, s);
  }
  const byGroup = accountsByGroup(accounts, true);
  // A financiamento shows what is still owed today instead of its 12 months.
  for (const account of byGroup.financing) {
    stats.set(account.id, {
      amount: debtBalance(account, expenses, today),
      count: stats.get(account.id)?.count ?? 0,
    });
  }

  async function onSuggest() {
    const created = await seedDefaultAccounts();
    addToast({
      messageType: created > 0 ? "success" : "info",
      text:
        created === 0
          ? "Todas as contas padrão já existem"
          : created === 1
            ? "1 conta criada"
            : `${created} contas criadas`,
    });
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div>
          <Link
            href="/settings"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink md:min-h-0"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Configurações
          </Link>
        </div>

        <PageHeader
          title="Plano de contas"
          subtitle="As contas de cada grupo. Os grupos não mudam: os de despesa formam o COE e os de fora do resultado não entram no custo; as contas são da fazenda."
          badges={canEdit ? undefined : <ReadOnlyPill />}
          actions={
            canEdit ? (
              <>
                <Button variant="outline" className="min-h-11 md:min-h-0" onClick={() => void onSuggest()}>
                  <Sparkles data-icon="inline-start" aria-hidden />
                  Sugerir contas padrão
                </Button>
                <Button className="min-h-11 md:min-h-0" onClick={() => setAdding({ place: "expense" })}>
                  <Plus data-icon="inline-start" aria-hidden />
                  Nova conta
                </Button>
              </>
            ) : undefined
          }
        />

        <div className="grid items-start gap-4 lg:grid-cols-5">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <SectionCard
              title="Receitas"
              subtitle="Entradas de dinheiro além das vendas"
              action={canEdit ? <AddAccountButton onClick={() => setAdding({ place: "revenue" })} /> : null}
            >
              <ul className="-mx-4 -mt-4 divide-y divide-hairline">
                <AutomaticLine name="Venda de gado" className="px-4" />
              </ul>
              <AccountList accounts={byGroup.revenue} stats={stats} canEdit={canEdit} />
            </SectionCard>

            <SectionCard
              title="Fora do resultado"
              subtitle="Fora do custo (COE) · financiamentos mostram o saldo devedor de hoje"
            >
              <div className="-my-4 divide-y divide-hairline">
                {CAPITAL_GROUPS.map((group) => (
                  <GroupSection
                    key={group}
                    group={group}
                    onAdd={canEdit ? () => setAdding({ place: group }) : undefined}
                  >
                    {group === "investment" ? (
                      <ul className="mt-2 divide-y divide-hairline">
                        <AutomaticLine name="Compra de gado" />
                      </ul>
                    ) : null}
                    <AccountList
                      accounts={byGroup[group]}
                      stats={stats}
                      canEdit={canEdit}
                      empty="Sem contas — crie uma para lançar aqui"
                    />
                  </GroupSection>
                ))}
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Despesas (COE)" subtitle="Valores dos últimos 12 meses" className="lg:col-span-3">
            <div className="-my-4 divide-y divide-hairline">
              {EXPENSE_GROUPS.map((group) => (
                <GroupSection
                  key={group}
                  group={group}
                  onAdd={canEdit ? () => setAdding({ place: "expense", category: group }) : undefined}
                >
                  <AccountList accounts={byGroup[group]} stats={stats} canEdit={canEdit} />
                </GroupSection>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="flex gap-2 rounded-lg border border-attention/30 bg-attention-soft p-4 text-sm text-ink">
          <Info className="mt-0.5 size-4 shrink-0 text-attention" aria-hidden />
          <p>
            Conta com lançamentos não se apaga: arquive para tirá-la do formulário e manter o
            histórico. Renomear uma conta renomeia também os lançamentos antigos. Despesa ou receita
            sem conta fica só no grupo; investimento, financiamento e sócios sempre levam uma conta.
          </p>
        </div>
      </div>

      <NewAccountDialog
        open={adding !== null}
        onOpenChange={(open) => {
          if (!open) setAdding(null);
        }}
        defaultPlace={adding?.place}
        defaultCategory={adding?.category}
      />
    </div>
  );
}

function AddAccountButton({ onClick }: { onClick(): void }) {
  return (
    <Button variant="ghost" size="sm" className="min-h-11 md:min-h-0" onClick={onClick}>
      <Plus data-icon="inline-start" aria-hidden />
      Conta
    </Button>
  );
}

/** A line the manejos write by themselves (Venda de gado, Compra de gado). */
function AutomaticLine({ name, className }: { name: string; className?: string }) {
  return (
    <li className={cn("flex min-h-11 items-center gap-2 py-2", className)}>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{name}</span>
      <span className="inline-flex items-center rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
        automática
      </span>
    </li>
  );
}

/** One grupo inside a card: its name, its hint, "+ Conta" and what follows. */
function GroupSection({ group, onAdd, children }: { group: AccountGroup; onAdd?: () => void; children: ReactNode }) {
  return (
    <section className="py-4">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{ACCOUNT_GROUP_LABEL[group]}</h3>
          {GROUP_HINT[group] ? <p className="text-xs text-ink-soft">{GROUP_HINT[group]}</p> : null}
        </div>
        {onAdd ? <AddAccountButton onClick={onAdd} /> : null}
      </header>
      {children}
    </section>
  );
}

/** A grupo's contas: the active ones, then the archived under a disclosure. */
function AccountList({
  accounts,
  stats,
  canEdit,
  empty = "Sem contas — lançamentos ficam só no grupo",
}: {
  accounts: Account[];
  stats: Map<string, AccountStats>;
  canEdit: boolean;
  /** What an empty grupo says. */
  empty?: string;
}) {
  const active = accounts.filter((a) => !a.archivedAt);
  const archived = accounts.filter((a) => a.archivedAt);
  return (
    <>
      {active.length === 0 ? (
        <p className="mt-2 text-xs text-ink-soft">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-hairline">
          {active.map((account) => (
            <AccountRow key={account.id} account={account} stats={stats.get(account.id)} canEdit={canEdit} />
          ))}
        </ul>
      )}
      {archived.length > 0 ? (
        <details className="mt-2">
          <summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium text-ink-soft hover:text-ink md:min-h-0">
            Arquivadas ({archived.length})
          </summary>
          <ul className="divide-y divide-hairline">
            {archived.map((account) => (
              <AccountRow key={account.id} account={account} stats={stats.get(account.id)} canEdit={canEdit} />
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

function AccountRow({
  account,
  stats,
  canEdit,
}: {
  account: Account;
  stats: AccountStats | undefined;
  canEdit: boolean;
}) {
  const updateAccount = useHerdStore((s) => s.updateAccount);
  const { addToast } = useToast();
  /** Renaming; a financiamento also edits its saldo devedor inicial and its day. */
  const [draft, setDraft] = useState<{ name: string; opening: string; openingDate: string } | null>(null);
  const archived = Boolean(account.archivedAt);
  const financing = account.group === "financing";
  const count = stats?.count ?? 0;

  function startEdit() {
    setDraft({
      name: account.name,
      opening: account.openingBalanceBrl === undefined ? "" : String(account.openingBalanceBrl).replace(".", ","),
      openingDate: account.openingDate ?? "",
    });
  }

  async function onSave() {
    if (!draft) return;
    const clean = draft.name.trim();
    const rename = clean !== "" && clean !== account.name;
    const opening = financing ? openingFromFields(draft.opening, draft.openingDate) : null;
    if (typeof opening === "string") {
      addToast({ messageType: "error", text: opening });
      return;
    }
    if (!rename && !financing) {
      setDraft(null);
      return;
    }
    const patch = {
      ...(rename ? { name: clean } : {}),
      // Both blank clears the saldo inicial.
      ...(financing ? (opening ?? { openingBalanceBrl: null, openingDate: null }) : {}),
    };
    if (!(await updateAccount(account.id, patch))) {
      addToast({ messageType: "error", text: "Já existe uma conta com esse nome" });
      return;
    }
    addToast({ messageType: "success", text: financing ? "Conta salva" : "Conta renomeada" });
    setDraft(null);
  }

  async function onArchive() {
    if (await updateAccount(account.id, { archived: !archived })) {
      addToast({ messageType: "success", text: archived ? "Conta restaurada" : "Conta arquivada" });
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void onSave();
    if (e.key === "Escape") setDraft(null);
  };

  if (draft !== null) {
    return (
      <li className="flex flex-wrap items-end gap-2 py-2">
        <Input
          autoFocus
          aria-label={`Novo nome de ${account.name}`}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onKeyDown={onKeyDown}
          className="min-h-11 min-w-40 flex-1 md:min-h-8"
        />
        {financing ? (
          <>
            <label className="grid gap-1 text-xs text-ink-soft">
              Saldo devedor inicial (R$)
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={draft.opening}
                onChange={(e) => setDraft({ ...draft, opening: e.target.value })}
                onKeyDown={onKeyDown}
                className="min-h-11 w-36 font-mono md:min-h-8"
              />
            </label>
            <label className="grid gap-1 text-xs text-ink-soft">
              Em
              <Input
                type="date"
                value={draft.openingDate}
                onChange={(e) => setDraft({ ...draft, openingDate: e.target.value })}
                onKeyDown={onKeyDown}
                className="min-h-11 w-40 font-mono md:min-h-8"
              />
            </label>
          </>
        ) : null}
        <Button size="sm" className="min-h-11 md:min-h-0" onClick={() => void onSave()}>
          Salvar
        </Button>
        <Button size="sm" variant="ghost" className="min-h-11 md:min-h-0" onClick={() => setDraft(null)}>
          Cancelar
        </Button>
      </li>
    );
  }

  const edit = financing ? "Editar" : "Renomear";
  return (
    <li className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className={cn("min-w-0 flex-1 basis-full text-sm break-words md:basis-0", archived ? "text-ink-soft" : "font-medium text-ink")}>
        {account.name}
        {financing && account.openingDate ? (
          <span className="block text-xs font-normal text-ink-soft">
            inicial {formatCurrency(account.openingBalanceBrl ?? 0)} em {formatDate(account.openingDate)}
          </span>
        ) : null}
      </span>
      <span className="font-mono text-sm text-ink">{formatCurrency(stats?.amount ?? 0)}</span>
      <span className="w-24 text-right text-xs text-ink-soft">
        {formatNumber(count)} {count === 1 ? "lançamento" : "lançamentos"}
      </span>
      {canEdit ? (
        <span className="ml-auto flex gap-1">
          {archived ? null : (
            <Button
              size="icon"
              variant="ghost"
              className="size-11 md:size-8"
              aria-label={`${edit} ${account.name}`}
              title={edit}
              onClick={startEdit}
            >
              <Pencil aria-hidden />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="size-11 md:size-8"
            aria-label={`${archived ? "Restaurar" : "Arquivar"} ${account.name}`}
            title={archived ? "Restaurar" : "Arquivar"}
            onClick={() => void onArchive()}
          >
            {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
          </Button>
        </span>
      ) : null}
    </li>
  );
}
