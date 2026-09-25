"use client";

/**
 * "Novo lançamento": a despesa or a receita with vencimento, pagamento, conta,
 * pago para, documento and lote (centro de custo). With `expense` it edits that
 * lançamento and the Despesa | Receita switch is hidden. Vendas and compras de
 * gado come from the manejos, never from here.
 */
import { useState, type FormEvent } from "react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { activeAnimals, activeLots } from "@/lib/store/selectors";
import { useToast } from "@/components/providers/Toasts";
import type { AccountGroup, EntryKind, Expense, ExpenseCategory } from "@/lib/types";
import { accountsByGroup, counterpartySuggestions } from "@/lib/domain/accounts";
import { todayISO } from "@/lib/domain/dates";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import { parseAmount } from "@/components/finance/parseAmount";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const CATEGORY_LIST = Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[];

/** Select value for "Sem conta" and "Fazenda toda": Radix refuses "". */
const NONE = "none";

const KINDS: readonly { kind: EntryKind; label: string }[] = [
  { kind: "expense", label: "Despesa" },
  { kind: "revenue", label: "Receita" },
];

interface EntryFields {
  kind: EntryKind;
  date: string;
  amount: string;
  category: ExpenseCategory;
  accountId: string;
  dueDate: string;
  /** The user changed Vencimento; until then it follows Data. */
  dueTouched: boolean;
  paid: boolean;
  paidAt: string;
  counterparty: string;
  document: string;
  lotId: string;
  notes: string;
}

function initialFields(expense: Expense | undefined, defaultKind: EntryKind): EntryFields {
  const today = todayISO();
  if (!expense) {
    return {
      kind: defaultKind,
      date: today,
      amount: "",
      category: "nutrition",
      accountId: NONE,
      dueDate: today,
      dueTouched: false,
      paid: true,
      paidAt: today,
      counterparty: "",
      document: "",
      lotId: NONE,
      notes: "",
    };
  }
  return {
    kind: expense.kind,
    date: expense.date,
    amount: String(expense.amountBrl).replace(".", ","),
    category: expense.category,
    accountId: expense.accountId ?? NONE,
    dueDate: expense.dueDate ?? expense.date,
    dueTouched: expense.dueDate !== undefined && expense.dueDate !== expense.date,
    paid: expense.paidAt !== undefined,
    paidAt: expense.paidAt ?? today,
    counterparty: expense.counterparty ?? "",
    document: expense.document ?? "",
    lotId: expense.lotId ?? NONE,
    notes: expense.notes ?? "",
  };
}

export function EntryDialog({
  open,
  onOpenChange,
  expense,
  defaultKind = "expense",
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  expense?: Expense;
  defaultKind?: EntryKind;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
          <DialogDescription>
            Despesas e receitas da fazenda. Vendas e compras de gado entram sozinhas pelos
            manejos.
          </DialogDescription>
        </DialogHeader>
        <EntryForm expense={expense} defaultKind={defaultKind} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EntryForm({
  expense,
  defaultKind,
  onDone,
}: {
  expense?: Expense;
  defaultKind: EntryKind;
  onDone(): void;
}) {
  const accounts = useHerdStore((s) => s.accounts);
  const expenses = useHerdStore((s) => s.expenses);
  const lots = useHerdStore((s) => s.lots);
  const animals = useHerdStore((s) => s.animals);
  const addExpense = useHerdStore((s) => s.addExpense);
  const updateExpense = useHerdStore((s) => s.updateExpense);
  const addAccount = useHerdStore((s) => s.addAccount);
  const { addToast } = useToast();

  const [fields, setFields] = useState<EntryFields>(() => initialFields(expense, defaultKind));
  const [newAccountName, setNewAccountName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);

  const set = (patch: Partial<EntryFields>) => setFields((f) => ({ ...f, ...patch }));

  const revenue = fields.kind === "revenue";
  const group: AccountGroup = revenue ? "revenue" : fields.category;
  const groupAccounts = accountsByGroup(accounts)[group];
  const currentAccount = accounts.find((a) => a.id === fields.accountId);
  const accountOptions =
    currentAccount && currentAccount.group === group && !groupAccounts.some((a) => a.id === currentAccount.id)
      ? [...groupAccounts, currentAccount]
      : groupAccounts;

  const heads = activeAnimals(animals);
  const lotOptions = [
    ...activeLots(lots),
    ...lots.filter((lot) => lot.deletedAt != null && lot.id === fields.lotId),
  ];
  const suggestions = counterpartySuggestions(expenses);

  function onDateChange(date: string) {
    setFields((f) => ({ ...f, date, dueDate: f.dueTouched ? f.dueDate : date }));
  }

  async function onCreateAccount() {
    const name = (newAccountName ?? "").trim();
    if (name === "" || creatingAccount) return;
    setCreatingAccount(true);
    let created;
    try {
      created = await addAccount({ group, name });
    } catch {
      return; // apiFail already toasted
    } finally {
      setCreatingAccount(false);
    }
    if (!created) {
      addToast({ messageType: "error", text: "Já existe uma conta com esse nome" });
      return;
    }
    set({ accountId: created.id });
    setNewAccountName(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (fields.date === "") {
      setError("Informe a data do lançamento.");
      return;
    }
    const amountBrl = parseAmount(fields.amount);
    if (!Number.isFinite(amountBrl) || amountBrl <= 0) {
      setError("Informe o valor (maior que zero).");
      return;
    }
    if (fields.dueDate === "") {
      setError("Informe o vencimento.");
      return;
    }
    if (fields.dueDate < fields.date) {
      setError("O vencimento não pode ser antes da data");
      return;
    }
    if (fields.paid && fields.paidAt === "") {
      setError(revenue ? "Informe a data do recebimento." : "Informe a data do pagamento.");
      return;
    }
    setError(null);
    setSaving(true);

    const category: ExpenseCategory = revenue ? "other" : fields.category;
    const paidAt = fields.paid ? fields.paidAt : null;
    const counterparty = fields.counterparty.trim() || null;
    const docNumber = fields.document.trim() || null;
    const accountId = fields.accountId === NONE ? null : fields.accountId;
    const lotId = fields.lotId === NONE ? null : fields.lotId;
    const notes = fields.notes.trim() || null;

    try {
      if (expense) {
        await updateExpense(expense.id, {
          date: fields.date,
          category,
          amountBrl,
          dueDate: fields.dueDate,
          paidAt,
          counterparty,
          document: docNumber,
          accountId,
          lotId,
          notes,
        });
        addToast({ messageType: "success", text: "Lançamento salvo" });
      } else {
        await addExpense({
          kind: fields.kind,
          date: fields.date,
          category,
          amountBrl,
          dueDate: fields.dueDate,
          paidAt: paidAt ?? undefined,
          counterparty: counterparty ?? undefined,
          document: docNumber ?? undefined,
          accountId: accountId ?? undefined,
          lotId: lotId ?? undefined,
          notes: notes ?? undefined,
        });
        addToast({ messageType: "success", text: revenue ? "Receita lançada" : "Despesa lançada" });
      }
    } catch {
      setSaving(false); // apiFail already toasted
      return;
    }
    setSaving(false);
    onDone();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {expense ? null : (
        <div
          role="radiogroup"
          aria-label="Tipo de lançamento"
          className="flex items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5"
        >
          {KINDS.map(({ kind, label }) => {
            const selected = fields.kind === kind;
            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  set({ kind, accountId: NONE });
                  setNewAccountName(null);
                }}
                className={cn(
                  "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-[13px] transition-colors md:min-h-8",
                  selected
                    ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="entry-date">Data</Label>
          <Input
            id="entry-date"
            type="date"
            value={fields.date}
            onChange={(e) => onDateChange(e.target.value)}
            className="min-h-11 font-mono md:min-h-0"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="entry-amount">Valor (R$)</Label>
          <Input
            id="entry-amount"
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={fields.amount}
            onChange={(e) => set({ amount: e.target.value })}
            className="min-h-11 font-mono md:min-h-0"
          />
        </div>

        <div className="grid gap-1.5">
          {revenue ? (
            <>
              <span className="text-sm leading-none font-medium">Grupo</span>
              <p className="flex min-h-11 items-center rounded-lg border border-input bg-surface px-2.5 text-sm text-ink-soft">
                Receitas
              </p>
            </>
          ) : (
            <>
              <Label htmlFor="entry-category">Grupo</Label>
              <Select
                value={fields.category}
                onValueChange={(category) => {
                  set({ category: category as ExpenseCategory, accountId: NONE });
                  setNewAccountName(null);
                }}
              >
                <SelectTrigger id="entry-category" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_LIST.map((category) => (
                    <SelectItem key={category} value={category}>
                      {EXPENSE_CATEGORY_LABEL[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="entry-account">Conta</Label>
          {newAccountName === null ? (
            <>
              <Select value={fields.accountId} onValueChange={(accountId) => set({ accountId })}>
                <SelectTrigger id="entry-account" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem conta</SelectItem>
                  {accountOptions.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => setNewAccountName("")}
                className="inline-flex min-h-11 items-center self-start text-xs font-medium text-brand hover:underline md:min-h-0"
              >
                + nova conta
              </button>
            </>
          ) : (
            <div className="flex gap-2">
              <Input
                id="entry-account"
                autoFocus
                value={newAccountName}
                placeholder="Nome da conta"
                onChange={(e) => setNewAccountName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void onCreateAccount();
                  }
                }}
                className="min-h-11"
              />
              <Button
                type="button"
                className="min-h-11"
                disabled={creatingAccount}
                onClick={() => void onCreateAccount()}
              >
                Criar
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="entry-due">Vencimento</Label>
          <Input
            id="entry-due"
            type="date"
            value={fields.dueDate}
            onChange={(e) => set({ dueDate: e.target.value, dueTouched: true })}
            className="min-h-11 font-mono md:min-h-0"
          />
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm leading-none font-medium">
            {revenue ? "Recebimento" : "Pagamento"}
          </span>
          <div className="flex min-h-11 items-center gap-2">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={fields.paid}
                onChange={(e) => set({ paid: e.target.checked })}
                className="size-4 shrink-0 accent-brand"
              />
              {revenue ? "Já recebido" : "Já pago"}
              {fields.paid ? " em" : ""}
            </label>
            {fields.paid ? (
              <Input
                type="date"
                aria-label={revenue ? "Data do recebimento" : "Data do pagamento"}
                value={fields.paidAt}
                onChange={(e) => set({ paidAt: e.target.value })}
                className="min-h-11 min-w-0 flex-1 font-mono md:min-h-9"
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="entry-counterparty">{revenue ? "Recebido de" : "Pago para"}</Label>
        <Input
          id="entry-counterparty"
          list="entry-counterparty-list"
          value={fields.counterparty}
          onChange={(e) => set({ counterparty: e.target.value })}
          className="min-h-11"
        />
        <datalist id="entry-counterparty-list">
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {suggestions.length > 0 ? (
          <p className="text-xs text-ink-soft">sugestões dos lançamentos anteriores</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="entry-document">Documento</Label>
          <Input
            id="entry-document"
            value={fields.document}
            placeholder="NF 4.812"
            onChange={(e) => set({ document: e.target.value })}
            className="min-h-11 font-mono md:min-h-0"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="entry-lot">Lote (centro de custo)</Label>
          <Select value={fields.lotId} onValueChange={(lotId) => set({ lotId })}>
            <SelectTrigger id="entry-lot" className="min-h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Fazenda toda (rateio por cabeça)</SelectItem>
              {lotOptions.map((lot) => (
                <SelectItem key={lot.id} value={lot.id}>
                  {lot.name} · {heads.filter((a) => a.lotId === lot.id).length} cab
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-ink-soft">Sem lote = fazenda toda, rateado por cabeça</p>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="entry-notes">Observação</Label>
        <Textarea
          id="entry-notes"
          value={fields.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Ex.: reforço de aftosa, 2ª dose"
        />
      </div>

      {error ? <p className="text-xs text-overdue">{error}</p> : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11">
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" className="min-h-11" disabled={saving}>
          {expense ? "Salvar" : "Lançar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
