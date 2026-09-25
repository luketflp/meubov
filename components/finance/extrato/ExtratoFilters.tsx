"use client";

/**
 * The Extrato's filters card: the window, the tipo tabs, grupo, conta, lote,
 * status and the text search. On a phone the window and the tipo tabs stay on
 * the page and the rest opens in a "Filtros" sheet.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import type { Account, AccountGroup, Lot } from "@/lib/types";
import type { Period } from "@/lib/domain/period";
import { ACCOUNT_GROUPS, ACCOUNT_GROUP_LABEL, accountsByGroup } from "@/lib/domain/accounts";
import type { LedgerFilter, LedgerKind } from "@/lib/domain/ledger";
import { PeriodPicker } from "@/components/dashboard/PeriodPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** "pagos / recebidos" is one choice over two ledger statuses. */
export type StatusChoice = "all" | "settled" | "payable" | "receivable" | "overdue";
export type ExtratoFilter = Omit<LedgerFilter, "status"> & { status: StatusChoice };
/** The URL keys the filters write. */
export type FilterKey = "tipo" | "grupo" | "conta" | "lote" | "status" | "q";

export const KIND_TABS: readonly (LedgerKind | "all")[] = [
  "all",
  "expense",
  "revenue",
  "sale",
  "purchase",
  "treatment",
];
export const KIND_TAB_LABEL: Record<LedgerKind | "all", string> = {
  all: "Tudo",
  expense: "Despesas",
  revenue: "Receitas",
  sale: "Vendas",
  purchase: "Compras",
  treatment: "Tratamentos",
};
export const STATUS_CHOICES: readonly StatusChoice[] = ["all", "settled", "payable", "receivable", "overdue"];
export const STATUS_CHOICE_LABEL: Record<StatusChoice, string> = {
  all: "todos",
  settled: "pagos / recebidos",
  payable: "a pagar",
  receivable: "a receber",
  overdue: "vencidas",
};

/** A Dialog pinned to the bottom of a phone screen. */
export const BOTTOM_SHEET =
  "top-auto bottom-0 left-0 w-full max-w-full translate-x-0 translate-y-0 rounded-b-none pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-w-full";

const SEARCH_DELAY_MS = 300;

interface ExtratoFiltersProps {
  period: Period;
  filter: ExtratoFilter;
  accounts: Account[];
  /** The lotes offered: the active ones plus removed ones the window's rows name. */
  lots: Lot[];
  /** Filters besides the window and the tipo that narrow the list (the "Filtros" count). */
  activeCount: number;
  onPeriodChange: (period: Period) => void;
  onChange: (changes: Partial<Record<FilterKey, string>>) => void;
}

export function ExtratoFilters({
  period,
  filter,
  accounts,
  lots,
  activeCount,
  onPeriodChange,
  onChange,
}: ExtratoFiltersProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const fields = { filter, accounts, lots, onChange };

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-hairline bg-panel p-3 md:flex-row md:flex-wrap md:items-center md:gap-2 md:p-4">
      {/* PeriodPicker is inline-flex: full width on a phone. */}
      <div className="[&>div]:flex [&>div]:w-full [&_input]:flex-1 md:[&>div]:inline-flex md:[&>div]:w-auto md:[&_input]:flex-none">
        <PeriodPicker value={period} onChange={onPeriodChange} />
      </div>

      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div
            role="group"
            aria-label="Tipo"
            className="inline-flex items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5"
          >
            {KIND_TABS.map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={filter.kind === kind}
                onClick={() => onChange({ tipo: kind })}
                className={cn(
                  "flex min-h-11 items-center justify-center rounded-md px-3 text-[13px] whitespace-nowrap transition-colors md:min-h-8",
                  filter.kind === kind
                    ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                {KIND_TAB_LABEL[kind]}
              </button>
            ))}
          </div>
        </div>

        <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="min-h-11 shrink-0 md:hidden">
              <SlidersHorizontal aria-hidden />
              Filtros{activeCount > 0 ? ` · ${activeCount}` : ""}
            </Button>
          </DialogTrigger>
          <DialogContent className={BOTTOM_SHEET} aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Filtros</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <FilterFields {...fields} stacked />
            </div>
            <Button className="min-h-11" onClick={() => setSheetOpen(false)}>
              Ver lançamentos
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="hidden md:contents">
        <FilterFields {...fields} />
      </div>
    </section>
  );
}

interface FilterFieldsProps {
  filter: ExtratoFilter;
  accounts: Account[];
  lots: Lot[];
  onChange: ExtratoFiltersProps["onChange"];
  /** Full-width fields, one per line (the phone sheet). */
  stacked?: boolean;
}

function FilterFields({ filter, accounts, lots, onChange, stacked = false }: FilterFieldsProps) {
  const byGroup = accountsByGroup(accounts, true);
  const accountOptions =
    filter.group === "all"
      ? ACCOUNT_GROUPS.flatMap((group) => byGroup[group])
      : filter.group === "capital"
        ? []
        : byGroup[filter.group];

  return (
    <>
      <FilterSelect
        label="Grupo"
        value={filter.group}
        stacked={stacked}
        onValueChange={(grupo) => onChange({ grupo, conta: "all" })}
      >
        <SelectItem value="all">todos</SelectItem>
        {ACCOUNT_GROUPS.map((group: AccountGroup) => (
          <SelectItem key={group} value={group}>
            {ACCOUNT_GROUP_LABEL[group]}
          </SelectItem>
        ))}
        <SelectItem value="capital">Capital</SelectItem>
      </FilterSelect>

      <FilterSelect
        label="Conta"
        value={filter.accountId}
        stacked={stacked}
        disabled={accountOptions.length === 0}
        onValueChange={(conta) => onChange({ conta })}
      >
        <SelectItem value="all">todas</SelectItem>
        {accountOptions.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {filter.group === "all"
              ? `${account.name} · ${ACCOUNT_GROUP_LABEL[account.group]}`
              : account.name}
          </SelectItem>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Lote"
        value={filter.lotId}
        stacked={stacked}
        onValueChange={(lote) => onChange({ lote })}
      >
        <SelectItem value="all">todos</SelectItem>
        <SelectItem value="farm">Fazenda (sem lote)</SelectItem>
        {lots.map((lot) => (
          <SelectItem key={lot.id} value={lot.id}>
            {lot.deletedAt ? `${lot.name} (removido)` : lot.name}
          </SelectItem>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Status"
        value={filter.status}
        stacked={stacked}
        onValueChange={(status) => onChange({ status })}
      >
        {STATUS_CHOICES.map((status) => (
          <SelectItem key={status} value={status}>
            {STATUS_CHOICE_LABEL[status]}
          </SelectItem>
        ))}
      </FilterSelect>

      <SearchField value={filter.search} stacked={stacked} onSearch={(q) => onChange({ q })} />
    </>
  );
}

function FilterSelect({
  label,
  value,
  onValueChange,
  disabled,
  stacked,
  children,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  stacked: boolean;
  children: ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        aria-label={`Filtrar por ${label.toLowerCase()}`}
        className={cn("min-h-11 font-medium md:min-h-0", stacked && "w-full")}
      >
        <span className="flex min-w-0 items-center gap-1">
          <span className="text-ink-soft">{label}:</span>
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

/** Types into local state; `q` in the URL catches up 300 ms after the last key. */
function SearchField({
  value,
  stacked,
  onSearch,
}: {
  value: string;
  stacked: boolean;
  onSearch: (q: string) => void;
}) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  // The URL's q changed elsewhere ("Limpar filtros", the other field): the box follows it.
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }

  useEffect(() => {
    if (text.trim() === value) return;
    const timer = setTimeout(() => onSearch(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, value, onSearch]);

  return (
    <div className={cn("relative", stacked ? "w-full" : "md:w-56")}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-soft"
      />
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Pago para / recebido de"
        aria-label="Buscar por conta, pago para / recebido de, documento ou observação"
        className="h-11 pl-8 md:h-8"
      />
    </div>
  );
}
