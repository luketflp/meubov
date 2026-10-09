"use client";

/**
 * /settings/plano-de-contas: the farm's contas inside their grupos, every
 * grupo the farm's, each with its GroupHeader (Renomear, Arquivar, Excluir
 * while unused, "+ Conta"). Receitas (Venda de gado is automatic, from the
 * manejos, then the grupos de receita) and Fora do resultado (Compra de gado,
 * then the grupos de investimento, financiamento and sócios by name, each
 * naming its tipo) on the left, Despesas (COE) on the right; each card has its
 * "+ Grupo" and closes with its "Grupos arquivados". A conta shows its last 12
 * months and lançamento count; a financiamento shows its saldo devedor today
 * instead, its saldo inicial under the name, and edits the saldo inicial
 * beside the name. A conta or grupo with lançamentos is archived, which hides
 * it from the forms and keeps history; one without them may be deleted.
 */
import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, ArrowLeft, ChevronDown, Info, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Account, GroupKind, PlanGroup } from "@/lib/types";
import { accountsByGroup } from "@/lib/domain/accounts";
import { CAPITAL_GROUPS, isCapitalKind, isInflow } from "@/lib/domain/entries";
import { byGroupName, groupsOf } from "@/lib/domain/groups";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import {
  NewAccountDialog,
  openingFromFields,
  type AccountPlace,
} from "@/components/finance/plano/NewAccountDialog";
import { NewGroupDialog } from "@/components/finance/plano/NewGroupDialog";
import { GroupHeader, groupEntryCount } from "@/components/finance/plano/GroupHeader";

interface AccountStats {
  /** Last 12 months, a venda do bem or an aporte taken off; a financiamento's saldo devedor today. */
  amount: number;
  count: number;
}

export function AccountsPage() {
  const accounts = useHerdStore((s) => s.accounts);
  const expenses = useHerdStore((s) => s.expenses);
  const planGroups = useHerdStore((s) => s.planGroups);
  const seedDefaultAccounts = useHerdStore((s) => s.seedDefaultAccounts);
  const canEdit = useCan("finance", "edit");
  const { addToast } = useToast();
  const [adding, setAdding] = useState<{ place: AccountPlace; group?: string } | null>(null);
  /** The tipos the open "+ Grupo" offers: its card's. */
  const [addingGroup, setAddingGroup] = useState<readonly GroupKind[] | null>(null);

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
  // Any lançamento ever, not only the 12 months above, keeps a conta from being deleted.
  const used = new Set(expenses.map((e) => e.accountId));
  const byGroup = accountsByGroup(accounts, true);
  const entriesIn = (id: string) => groupEntryCount(id, expenses, accounts);
  const capitalGroups = CAPITAL_GROUPS.flatMap((kind) => groupsOf(planGroups, kind, { archived: true })).sort(
    byGroupName
  );
  // A financiamento shows what is still owed today instead of its 12 months.
  for (const group of capitalGroups.filter((g) => g.kind === "financing")) {
    for (const account of byGroup[group.id] ?? []) {
      stats.set(account.id, {
        amount: debtBalance(account, expenses, today),
        count: stats.get(account.id)?.count ?? 0,
      });
    }
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

  /** A card's grupos, each with its header and contas, then "Grupos arquivados". */
  const groupBlocks = (groups: PlanGroup[]) => {
    const active = groups.filter((g) => !g.archivedAt);
    const archived = groups.filter((g) => g.archivedAt);
    return (
      <>
        {active.length === 0 ? <p className="py-4 text-xs text-ink-soft">Nenhum grupo ativo.</p> : null}
        {active.map((group) => {
          const contas = byGroup[group.id] ?? [];
          return (
            <section key={group.id} className="py-4">
              <GroupHeader
                group={group}
                contas={contas.filter((a) => !a.archivedAt).length}
                entries={entriesIn(group.id)}
                onAdd={canEdit ? () => setAdding({ place: group.kind, group: group.id }) : undefined}
              />
              <AccountList
                accounts={contas}
                stats={stats}
                used={used}
                canEdit={canEdit}
                financing={group.kind === "financing"}
                empty={isCapitalKind(group.kind) ? "Sem contas — crie uma para lançar aqui" : undefined}
              />
            </section>
          );
        })}
        {archived.length > 0 ? <ArchivedGroups groups={archived} entriesIn={entriesIn} canEdit={canEdit} /> : null}
      </>
    );
  };

  const addGroup = (kinds: readonly GroupKind[]) =>
    canEdit ? (
      <Button variant="outline" size="sm" className="min-h-11 md:min-h-0" onClick={() => setAddingGroup(kinds)}>
        <Plus data-icon="inline-start" aria-hidden />
        Grupo
      </Button>
    ) : null;

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
          subtitle="As contas de cada grupo. Todos os grupos são da fazenda: renomeie, arquive ou exclua os que não usa."
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
            <SectionCard title="Receitas" subtitle="Entradas de dinheiro além das vendas" action={addGroup(["revenue"])}>
              <div className="-my-4 divide-y divide-hairline">
                <ul>
                  <AutomaticLine name="Venda de gado" />
                </ul>
                {groupBlocks(groupsOf(planGroups, "revenue", { archived: true }))}
              </div>
            </SectionCard>

            <SectionCard
              title="Fora do resultado"
              subtitle="Fora do custo (COE) · financiamentos mostram o saldo devedor de hoje"
              action={addGroup(CAPITAL_GROUPS)}
            >
              <div className="-my-4 divide-y divide-hairline">
                <ul>
                  <AutomaticLine name="Compra de gado" />
                </ul>
                {groupBlocks(capitalGroups)}
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Despesas (COE)"
            subtitle="Valores dos últimos 12 meses"
            action={addGroup(["expense"])}
            className="lg:col-span-3"
          >
            <div className="-my-4 divide-y divide-hairline">
              {groupBlocks(groupsOf(planGroups, "expense", { archived: true }))}
            </div>
          </SectionCard>
        </div>

        <div className="flex gap-2 rounded-lg border border-attention/30 bg-attention-soft p-4 text-sm text-ink">
          <Info className="mt-0.5 size-4 shrink-0 text-attention" aria-hidden />
          <p>
            Conta ou grupo com lançamentos não se apaga: arquive para tirá-lo do formulário e manter o histórico; sem
            lançamentos pode ser excluído. Renomear renomeia também os lançamentos antigos. Despesa ou receita sem conta
            fica só no grupo; investimento, financiamento e sócios sempre levam uma conta.
          </p>
        </div>
      </div>

      <NewAccountDialog
        open={adding !== null}
        onOpenChange={(open) => {
          if (!open) setAdding(null);
        }}
        defaultPlace={adding?.place}
        defaultGroup={adding?.group}
      />
      {addingGroup ? (
        <NewGroupDialog
          open
          kinds={addingGroup}
          onOpenChange={(open) => {
            if (!open) setAddingGroup(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** A line the manejos write by themselves (Venda de gado, Compra de gado). */
function AutomaticLine({ name }: { name: string }) {
  return (
    <li className="flex min-h-11 items-center gap-2 py-2">
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{name}</span>
      <span className="inline-flex items-center rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
        automática
      </span>
    </li>
  );
}

/** "Grupos arquivados": out of the forms, their lançamentos kept; Restaurar brings one back. */
function ArchivedGroups({
  groups,
  entriesIn,
  canEdit,
}: {
  groups: PlanGroup[];
  /** Lançamentos ever made in a grupo. */
  entriesIn(id: string): number;
  canEdit: boolean;
}) {
  const updatePlanGroup = useHerdStore((s) => s.updatePlanGroup);
  const { addToast } = useToast();

  async function onRestore(group: PlanGroup) {
    try {
      await updatePlanGroup(group.id, { archived: false });
      addToast({ messageType: "success", text: "Grupo restaurado" });
    } catch {
      // apiFail already told the user.
    }
  }

  return (
    <details className="group py-3">
      <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink md:min-h-0">
        <ChevronDown className="size-3.5 -rotate-90 transition-transform group-open:rotate-0" aria-hidden />
        Grupos arquivados ({groups.length})
      </summary>
      <ul className="mt-1 divide-y divide-hairline">
        {groups.map((group) => {
          const count = entriesIn(group.id);
          return (
            <li key={group.id} className="flex min-h-11 items-center gap-3 py-2">
              <span className="min-w-0 flex-1 text-sm break-words text-ink-soft">
                {group.name}
                <span className="block text-xs">
                  {formatNumber(count)} {count === 1 ? "lançamento" : "lançamentos"}
                </span>
              </span>
              {canEdit ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-11 md:size-8"
                  aria-label={`Restaurar o grupo ${group.name}`}
                  title="Restaurar grupo"
                  onClick={() => void onRestore(group)}
                >
                  <ArchiveRestore aria-hidden />
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** A grupo's contas: the active ones, then the archived under a disclosure. */
function AccountList({
  accounts,
  stats,
  used,
  canEdit,
  financing,
  empty = "Sem contas — lançamentos ficam só no grupo",
}: {
  accounts: Account[];
  stats: Map<string, AccountStats>;
  /** Contas some lançamento points at. */
  used: ReadonlySet<string | undefined>;
  canEdit: boolean;
  /** A grupo de financiamento: its contas carry a saldo devedor. */
  financing: boolean;
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
            <AccountRow
              key={account.id}
              account={account}
              stats={stats.get(account.id)}
              deletable={!used.has(account.id)}
              canEdit={canEdit}
              financing={financing}
            />
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
                <AccountRow
                key={account.id}
                account={account}
                stats={stats.get(account.id)}
                deletable={!used.has(account.id)}
                canEdit={canEdit}
                financing={financing}
              />
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
  deletable,
  canEdit,
  financing,
}: {
  account: Account;
  stats: AccountStats | undefined;
  /** No lançamento points at it; the server still refuses one a recorrência keeps. */
  deletable: boolean;
  canEdit: boolean;
  /** A conta de financiamento: it edits its saldo devedor inicial too. */
  financing: boolean;
}) {
  const updateAccount = useHerdStore((s) => s.updateAccount);
  const removeAccount = useHerdStore((s) => s.removeAccount);
  const { addToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Renaming; a financiamento also edits its saldo devedor inicial and its day. */
  const [draft, setDraft] = useState<{ name: string; opening: string; openingDate: string } | null>(null);
  const archived = Boolean(account.archivedAt);
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

  async function onRemove() {
    setBusy(true);
    try {
      if ((await removeAccount(account.id)) === "in_use") {
        addToast({ messageType: "error", text: "Conta com lançamentos não se apaga. Arquive em vez de excluir." });
        setConfirming(false);
        return;
      }
      addToast({ messageType: "success", text: "Conta excluída" });
    } catch {
      // apiFail already told the user.
    } finally {
      setBusy(false);
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
          {deletable ? (
            <Button
              size="icon"
              variant="ghost"
              className="size-11 md:size-8"
              aria-label={`Excluir ${account.name}`}
              title="Excluir"
              onClick={() => setConfirming(true)}
            >
              <Trash2 aria-hidden />
            </Button>
          ) : (
            // Keeps the figures lined up with the rows that can be deleted; a phone row wraps anyway.
            <span className="hidden md:block md:size-8" aria-hidden />
          )}
        </span>
      ) : null}
      <Dialog
        open={confirming}
        onOpenChange={(next) => {
          if (!next && !busy) setConfirming(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir conta?</DialogTitle>
            <DialogDescription>{account.name} sai do plano de contas e do orçamento.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 md:min-h-9"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 md:min-h-9"
              disabled={busy}
              onClick={() => void onRemove()}
            >
              {busy ? "Excluindo…" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
