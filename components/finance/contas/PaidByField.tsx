"use client";

/**
 * "Pago por" / "Recebido em": the conta a lançamento was paid from or received
 * into. Offers the contas that are not archived, the conta principal first,
 * cartões for despesas only, and "Sem conta" ("" — a row paid before the
 * contas existed). Renders nothing while the farm has no conta.
 */
import type { BankAccount, EntryKind } from "@/lib/types";
import { bankAccountLabel, payingAccounts } from "@/lib/domain/bankAccounts";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** The conta "Pago por" starts on: the conta principal, else the first one offered; "" with none. */
export function defaultPaidBy(accounts: BankAccount[], kind: EntryKind): string {
  return payingAccounts(accounts, kind)[0]?.id ?? "";
}

/** Radix Select takes no "" value: "Sem conta" goes by this one. */
const NO_ACCOUNT = "__none";

/** The contas the field lists; none means it renders nothing. */
export function paidByOptions(accounts: BankAccount[], kind: EntryKind, value: string): BankAccount[] {
  const options = payingAccounts(accounts, kind);
  // A row paid by a conta archived since keeps showing it.
  const current = accounts.find((a) => a.id === value);
  return current && !options.includes(current) ? [...options, current] : options;
}

export function PaidByField({
  id,
  accounts,
  kind,
  value,
  disabled,
  onChange,
}: {
  id: string;
  accounts: BankAccount[];
  kind: EntryKind;
  value: string;
  disabled?: boolean;
  onChange(value: string): void;
}) {
  const shown = paidByOptions(accounts, kind, value);
  if (shown.length === 0) return null;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{kind === "revenue" ? "Recebido em" : "Pago por"}</Label>
      <Select
        value={value === "" ? NO_ACCOUNT : value}
        onValueChange={(next) => onChange(next === NO_ACCOUNT ? "" : next)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="min-h-11 w-full">
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
