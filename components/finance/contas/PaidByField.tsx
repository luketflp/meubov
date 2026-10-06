"use client";

/**
 * "Pago por" / "Recebido em": the conta a lançamento was paid from or received
 * into. Offers the contas that may take it (`payingAccounts`: not archived,
 * the conta principal first, a cartão only for a despesa or the compra of an
 * investimento, an aplicação only for a rendimento) and "Sem conta" ("" — a
 * row paid before the contas existed). Renders nothing while no conta may.
 */
import type { BankAccount, EntryFlow, EntryKind } from "@/lib/types";
import { bankAccountLabel, payingAccounts } from "@/lib/domain/bankAccounts";
import { isInflow } from "@/lib/domain/entries";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** The conta "Pago por" starts on: the conta principal, else the first one offered; "" with none. */
export function defaultPaidBy(accounts: BankAccount[], kind: EntryKind, flow?: EntryFlow): string {
  return payingAccounts(accounts, kind, flow)[0]?.id ?? "";
}

/** Radix Select takes no "" value: "Sem conta" goes by this one. */
const NO_ACCOUNT = "__none";

/** The contas the field lists; none means it renders nothing. */
export function paidByOptions(
  accounts: BankAccount[],
  kind: EntryKind,
  value: string,
  flow?: EntryFlow
): BankAccount[] {
  const options = payingAccounts(accounts, kind, flow);
  // A row paid by a conta archived since keeps showing it.
  const current = accounts.find((a) => a.id === value);
  return current && !options.includes(current) ? [...options, current] : options;
}

export function PaidByField({
  id,
  accounts,
  kind,
  flow,
  value,
  disabled,
  onChange,
}: {
  id: string;
  accounts: BankAccount[];
  kind: EntryKind;
  /** Movimento of an investimento, financiamento or sócios. */
  flow?: EntryFlow;
  value: string;
  disabled?: boolean;
  onChange(value: string): void;
}) {
  const shown = paidByOptions(accounts, kind, value, flow);
  if (shown.length === 0) return null;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{isInflow({ kind, flow }) ? "Recebido em" : "Pago por"}</Label>
      <Select
        value={value === "" ? NO_ACCOUNT : value}
        onValueChange={(next) => onChange(next === NO_ACCOUNT ? "" : next)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="min-h-11 w-full md:min-h-9">
          <SelectValue placeholder="Escolha a conta" />
        </SelectTrigger>
        <SelectContent>
          {shown.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {bankAccountLabel(a)}
            </SelectItem>
          ))}
          <SelectItem value={NO_ACCOUNT}>Sem conta</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
