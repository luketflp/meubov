"use client";

/**
 * "Novo lançamento": a despesa or a receita with vencimento, pagamento, conta,
 * pago para, documento, lote (centro de custo), Repetir (uma vez, parcelado,
 * recorrente) and anexos. With `expense` it edits that lançamento: the
 * Despesa | Receita switch and Repetir are hidden, a row of a série says which
 * ("Parcela 2/3", "Recorrente · todo dia 20") and saving asks where the change
 * applies. Vendas and compras de gado come from the manejos, never from here.
 */
import { useState, type FormEvent } from "react";
import { Repeat } from "lucide-react";
import { useHerdStore, type ExpensePatch } from "@/lib/store/useHerdStore";
import { activeAnimals, activeLots } from "@/lib/store/selectors";
import { useToast } from "@/components/providers/Toasts";
import type { AccountGroup, EntryKind, Expense, ExpenseCategory, SeriesScope } from "@/lib/types";
import { accountsByGroup, counterpartySuggestions } from "@/lib/domain/accounts";
import { todayISO } from "@/lib/domain/dates";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
import { MAX_INSTALLMENTS, MIN_INSTALLMENTS, installmentLabel, recurrenceLabel } from "@/lib/domain/series";
import { cn } from "@/lib/utils";
import { parseAmount } from "@/components/finance/parseAmount";
import {
  RepeatSection,
  initialRepeat,
  repeatFromFields,
  type RepeatFields,
} from "@/components/finance/RepeatSection";
import { SeriesScopeDialog } from "@/components/finance/SeriesScopeDialog";
import { AttachmentsField, type PendingFile } from "@/components/finance/attachments/AttachmentsField";
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

/** Whether "Parcelas" holds a count the server takes (2–48). */
function countInRange(typed: string): boolean {
  const count = Number(typed);
  return Number.isInteger(count) && count >= MIN_INSTALLMENTS && count <= MAX_INSTALLMENTS;
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
  // While saving (and uploading) the dialog stays: Esc, outside click and Cancelar wait.
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
          <DialogDescription>
            Despesas e receitas da fazenda. Vendas e compras de gado entram sozinhas pelos
            manejos.
          </DialogDescription>
        </DialogHeader>
        <EntryForm
          expense={expense}
          defaultKind={defaultKind}
          onBusyChange={setBusy}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function EntryForm({
  expense,
  defaultKind,
  onBusyChange,
  onDone,
}: {
  expense?: Expense;
  defaultKind: EntryKind;
  onBusyChange(busy: boolean): void;
  onDone(): void;
}) {
  const accounts = useHerdStore((s) => s.accounts);
  const expenses = useHerdStore((s) => s.expenses);
  const lots = useHerdStore((s) => s.lots);
  const animals = useHerdStore((s) => s.animals);
  const addExpense = useHerdStore((s) => s.addExpense);
  const updateExpense = useHerdStore((s) => s.updateExpense);
  const addAccount = useHerdStore((s) => s.addAccount);
  const uploadAttachment = useHerdStore((s) => s.uploadAttachment);
  const { addToast } = useToast();

  const [fields, setFields] = useState<EntryFields>(() => initialFields(expense, defaultKind));
  const [repeatFields, setRepeatFields] = useState<RepeatFields>(() => initialRepeat(todayISO()));
  const [pending, setPending] = useState<PendingFile[]>([]);
  /** The edit waiting for "Só esta" · "Esta e as próximas" · "Todas". */
  const [scopePatch, setScopePatch] = useState<ExpensePatch | null>(null);
  const [newAccountName, setNewAccountName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSavingState] = useState(false);
  const setSaving = (next: boolean) => {
    setSavingState(next);
    onBusyChange(next);
  };
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

  const repeating = !expense && repeatFields.choice !== "once";
  const seriesLine = expense
    ? installmentLabel(expense)
      ? `Parcela ${installmentLabel(expense)}`
      : recurrenceLabel(expense)
        ? `Recorrente · ${recurrenceLabel(expense)}`
        : null
    : null;

  function onDateChange(date: string) {
    setFields((f) => ({ ...f, date, dueDate: f.dueTouched ? f.dueDate : date }));
    // The first parcela never falls before Data; the day follows Data until Repetir is chosen.
    if (date === "") return;
    setRepeatFields((r) => ({
      ...r,
      firstDue: r.firstDue < date ? date : r.firstDue,
      day: r.choice === "once" ? String(Number(date.slice(8, 10))) : r.day,
    }));
  }

  async function saveEdit(target: Expense, patch: ExpensePatch, scope: SeriesScope) {
    setSaving(true);
    try {
      await updateExpense(target.id, patch, scope);
      addToast({ messageType: "success", text: "Lançamento salvo" });
    } catch {
      setSaving(false); // apiFail already toasted
      return;
    }
    setSaving(false);
    onDone();
  }

  /**
   * Uploads the files chosen before the lançamento existed, one at a time, with
   * progress; answers how many failed.
   */
  async function uploadPending(expenseId: string): Promise<number> {
    let failed = 0;
    for (const item of pending) {
      const patch = (next: Partial<PendingFile>) =>
        setPending((files) => files.map((f) => (f.key === item.key ? { ...f, ...next } : f)));
      try {
        patch({ progress: 0 });
        await uploadAttachment(expenseId, item.file, (progress) => patch({ progress }));
        patch({ progress: 100 });
      } catch {
        patch({ progress: null, error: "não enviado" }); // the store already toasted
        failed += 1;
      }
    }
    return failed;
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
    const repeat = expense ? null : repeatFromFields(repeatFields, fields.date);
    if (typeof repeat === "string") {
      setError(repeat);
      return;
    }
    if (!repeat && fields.dueDate === "") {
      setError("Informe o vencimento.");
      return;
    }
    if (!repeat && fields.dueDate < fields.date) {
      setError("O vencimento não pode ser antes da data");
      return;
    }
    if (fields.paid && fields.paidAt === "") {
      setError(revenue ? "Informe a data do recebimento." : "Informe a data do pagamento.");
      return;
    }
    setError(null);

    const category: ExpenseCategory = revenue ? "other" : fields.category;
    const paidAt = fields.paid ? fields.paidAt : null;
    const counterparty = fields.counterparty.trim() || null;
    const docNumber = fields.document.trim() || null;
    const accountId = fields.accountId === NONE ? null : fields.accountId;
    const lotId = fields.lotId === NONE ? null : fields.lotId;
    const notes = fields.notes.trim() || null;

    if (expense) {
      const patch: ExpensePatch = {
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
      };
      // A row of a série asks where the change applies before saving.
      if (expense.seriesId) setScopePatch(patch);
      else await saveEdit(expense, patch, "one");
      return;
    }

    setSaving(true);
    let created: Expense[];
    try {
      created = await addExpense(
        {
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
        },
        repeat ?? undefined
      );
    } catch {
      setSaving(false); // apiFail already toasted
      return;
    }
    // The NF or recibo belongs to the purchase: the first parcela or ocorrência carries it.
    const failed = created.length > 0 && pending.length > 0 ? await uploadPending(created[0].id) : 0;
    if (failed > 0) {
      addToast({
        messageType: "warning",
        text: `Lançamento salvo; ${failed} anexo(s) não enviado(s) — anexe em Editar.`,
      });
    } else {
      const text =
        created.length > 1
          ? repeatFields.choice === "recurring"
            ? "Recorrência lançada"
            : "Parcelas lançadas"
          : revenue
            ? "Receita lançada"
            : "Despesa lançada";
      addToast({ messageType: "success", text });
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
          <Label htmlFor="entry-amount">
            {repeatFields.choice === "installments" && !expense ? "Valor total (R$)" : "Valor (R$)"}
          </Label>
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
            value={repeating ? "" : fields.dueDate}
            disabled={repeating}
            onChange={(e) => set({ dueDate: e.target.value, dueTouched: true })}
            className="min-h-11 font-mono md:min-h-0"
          />
          {repeating ? (
            <p className="text-xs text-ink-soft">
              {repeatFields.choice === "installments"
                ? "segue a 1ª parcela, abaixo"
                : "segue a recorrência, abaixo"}
            </p>
          ) : null}
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
          {repeating ? (
            <p className="text-xs text-ink-soft">
              {repeatFields.choice === "installments" ? "só a 1ª parcela" : "só a 1ª conta"}
            </p>
          ) : null}
        </div>
      </div>

      {expense ? (
        seriesLine ? (
          <p className="flex items-center gap-1.5 border-t border-hairline pt-4 text-sm text-ink">
            <Repeat className="size-4 text-ink-soft" aria-hidden />
            {seriesLine}
          </p>
        ) : null
      ) : (
        <RepeatSection
          fields={repeatFields}
          onChange={(patch) =>
            setRepeatFields((r) => ({
              ...r,
              ...patch,
              // Parcelado picks up a Vencimento the user already set.
              ...(patch.choice === "installments" && r.choice !== "installments" && fields.dueTouched && fields.dueDate
                ? { firstDue: fields.dueDate }
                : {}),
            }))
          }
          date={fields.date}
          amount={parseAmount(fields.amount)}
        />
      )}

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

      <AttachmentsField
        expenseId={expense?.id}
        pending={pending}
        onPendingChange={setPending}
        busy={saving}
      />

      <div className="grid gap-1.5">
        <Label htmlFor="entry-notes">Observação</Label>
        <Textarea
          id="entry-notes"
          value={fields.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Ex.: reforço de aftosa, 2ª dose"
        />
      </div>

      {error ? (
        <p role="alert" className="text-xs text-overdue">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11" disabled={saving}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" className="min-h-11" disabled={saving}>
          {expense
            ? "Salvar"
            : repeatFields.choice === "installments"
              ? `Lançar ${countInRange(repeatFields.count) ? `${repeatFields.count} ` : ""}parcelas`
              : repeatFields.choice === "recurring"
                ? "Lançar recorrência"
                : "Lançar"}
        </Button>
      </DialogFooter>

      {expense && scopePatch ? (
        <SeriesScopeDialog
          open
          onOpenChange={(open) => {
            if (!open) setScopePatch(null);
          }}
          expense={expense}
          action="edit"
          amountChange={
            scopePatch.amountBrl !== undefined && scopePatch.amountBrl !== expense.amountBrl
              ? { from: expense.amountBrl, to: scopePatch.amountBrl }
              : null
          }
          busy={saving}
          onConfirm={(scope) => void saveEdit(expense, scopePatch, scope)}
        />
      ) : null}
    </form>
  );
}
