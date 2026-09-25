"use client";

/**
 * /settings/plano-de-contas: the farm's contas inside the fixed grupos. Receitas
 * on the left (Venda de gado is automatic, from the manejos), Despesas (COE) on
 * the right, one block per grupo with its last 12 months and lançamento count.
 * A conta is never deleted: archiving hides it from the form and keeps history.
 */
import { useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, ArrowLeft, Info, Pencil, Plus, Sparkles } from "lucide-react";
import type { Account, AccountGroup, ExpenseCategory } from "@/lib/types";
import { ACCOUNT_GROUP_LABEL, ACCOUNT_GROUPS, accountsByGroup } from "@/lib/domain/accounts";
import { todayISO } from "@/lib/domain/dates";
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
import { AccountDialog } from "@/components/finance/plano/AccountDialog";

/** Where the app writes into a grupo by itself. */
const GROUP_HINT: Partial<Record<AccountGroup, string>> = {
  health: "Tratamentos com custo entram aqui sozinhos",
  breeding: "Compras de sêmen entram aqui sozinhas",
};

const EXPENSE_GROUPS = ACCOUNT_GROUPS.filter((g): g is ExpenseCategory => g !== "revenue");

interface AccountStats {
  total12m: number;
  count: number;
}

export function AccountsPage() {
  const accounts = useHerdStore((s) => s.accounts);
  const expenses = useHerdStore((s) => s.expenses);
  const seedDefaultAccounts = useHerdStore((s) => s.seedDefaultAccounts);
  const canEdit = useCan("finance", "edit");
  const { addToast } = useToast();
  const [adding, setAdding] = useState<AccountGroup | null>(null);

  const window12m = defaultPeriod(todayISO());
  const stats = new Map<string, AccountStats>();
  for (const e of expenses) {
    if (!e.accountId) continue;
    const s = stats.get(e.accountId) ?? { total12m: 0, count: 0 };
    if (!inPeriod(e.date, window12m)) continue;
    s.count += 1;
    s.total12m += e.amountBrl;
    stats.set(e.accountId, s);
  }
  const byGroup = accountsByGroup(accounts, true);

  function openDialog(group: AccountGroup) {
    setAdding(group);
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
          subtitle="As contas de cada grupo. Os grupos formam o COE e não mudam; as contas são da fazenda."
          badges={canEdit ? undefined : <ReadOnlyPill />}
          actions={
            canEdit ? (
              <>
                <Button variant="outline" className="min-h-11 md:min-h-0" onClick={() => void onSuggest()}>
                  <Sparkles data-icon="inline-start" aria-hidden />
                  Sugerir contas padrão
                </Button>
                <Button className="min-h-11 md:min-h-0" onClick={() => openDialog("revenue")}>
                  <Plus data-icon="inline-start" aria-hidden />
                  Nova conta
                </Button>
              </>
            ) : undefined
          }
        />

        <div className="grid items-start gap-4 lg:grid-cols-5">
          <SectionCard
            title="Receitas"
            subtitle="Entradas de dinheiro além das vendas"
            className="lg:col-span-2"
            action={canEdit ? <AddAccountButton onClick={() => openDialog("revenue")} /> : null}
          >
            <ul className="-mx-4 -mt-4 divide-y divide-hairline">
              <li className="flex min-h-11 items-center gap-2 px-4 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">Venda de gado</span>
                <span className="inline-flex items-center rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
                  automática
                </span>
              </li>
            </ul>
            <AccountList accounts={byGroup.revenue} stats={stats} canEdit={canEdit} />
          </SectionCard>

          <SectionCard title="Despesas (COE)" subtitle="Valores dos últimos 12 meses" className="lg:col-span-3">
            <div className="-my-4 divide-y divide-hairline">
              {EXPENSE_GROUPS.map((group) => (
                <section key={group} className="py-4">
                  <header className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-ink">{ACCOUNT_GROUP_LABEL[group]}</h3>
                      {GROUP_HINT[group] ? (
                        <p className="text-xs text-ink-soft">{GROUP_HINT[group]}</p>
                      ) : null}
                    </div>
                    {canEdit ? <AddAccountButton onClick={() => openDialog(group)} /> : null}
                  </header>
                  <AccountList accounts={byGroup[group]} stats={stats} canEdit={canEdit} />
                </section>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="flex gap-2 rounded-lg border border-attention/30 bg-attention-soft p-4 text-sm text-ink">
          <Info className="mt-0.5 size-4 shrink-0 text-attention" aria-hidden />
          <p>
            Conta com lançamentos não se apaga: arquive para tirá-la do formulário e manter o
            histórico. Renomear uma conta renomeia também os lançamentos antigos. Lançamento sem
            conta fica só no grupo.
          </p>
        </div>
      </div>

      <AccountDialog
        open={adding !== null}
        onOpenChange={(open) => {
          if (!open) setAdding(null);
        }}
        defaultGroup={adding ?? "revenue"}
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

/** A grupo's contas: the active ones, then the archived under a disclosure. */
function AccountList({
  accounts,
  stats,
  canEdit,
}: {
  accounts: Account[];
  stats: Map<string, AccountStats>;
  canEdit: boolean;
}) {
  const active = accounts.filter((a) => !a.archivedAt);
  const archived = accounts.filter((a) => a.archivedAt);
  return (
    <>
      {active.length === 0 ? (
        <p className="mt-2 text-xs text-ink-soft">Sem contas — lançamentos ficam só no grupo</p>
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
  const [name, setName] = useState<string | null>(null);
  const archived = Boolean(account.archivedAt);
  const count = stats?.count ?? 0;

  async function onRename() {
    const clean = (name ?? "").trim();
    if (clean === "" || clean === account.name) {
      setName(null);
      return;
    }
    if (!(await updateAccount(account.id, { name: clean }))) {
      addToast({ messageType: "error", text: "Já existe uma conta com esse nome" });
      return;
    }
    addToast({ messageType: "success", text: "Conta renomeada" });
    setName(null);
  }

  async function onArchive() {
    if (await updateAccount(account.id, { archived: !archived })) {
      addToast({ messageType: "success", text: archived ? "Conta restaurada" : "Conta arquivada" });
    }
  }

  if (name !== null) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-2">
        <Input
          autoFocus
          aria-label={`Novo nome de ${account.name}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onRename();
            if (e.key === "Escape") setName(null);
          }}
          className="min-h-11 min-w-40 flex-1 md:min-h-8"
        />
        <Button size="sm" className="min-h-11 md:min-h-0" onClick={() => void onRename()}>
          Salvar
        </Button>
        <Button size="sm" variant="ghost" className="min-h-11 md:min-h-0" onClick={() => setName(null)}>
          Cancelar
        </Button>
      </li>
    );
  }

  return (
    <li className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className={cn("min-w-0 flex-1 basis-full truncate text-sm md:basis-0", archived ? "text-ink-soft" : "font-medium text-ink")}>
        {account.name}
      </span>
      <span className="font-mono text-sm text-ink">{formatCurrency(stats?.total12m ?? 0)}</span>
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
              aria-label={`Renomear ${account.name}`}
              title="Renomear"
              onClick={() => setName(account.name)}
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
