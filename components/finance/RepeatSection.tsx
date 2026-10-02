"use client";

/**
 * "Repetir" in the EntryDialog: Uma vez · Parcelado · Recorrente. Parcelado
 * splits the Valor total into N parcelas with their own vencimentos and lists
 * them; Recorrente repeats the Valor every month (on a day) or week, until a
 * date or sem fim, and shows the next vencimentos.
 */
import { Repeat } from "lucide-react";
import type { SeriesFrequency, SeriesMode, SeriesRepeat } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import {
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  firstMonthlyOnOrAfter,
  installmentPlan,
  monthYear,
  nextDueDates,
  recurringDates,
} from "@/lib/domain/series";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type RepeatChoice = "once" | SeriesMode;

export interface RepeatFields {
  choice: RepeatChoice;
  /** Parcelas, as typed. */
  count: string;
  /** "Primeira parcela vence". */
  firstDue: string;
  frequency: SeriesFrequency;
  /** "no dia", as typed (monthly recorrência). */
  day: string;
  /** "até"; ignored while `noEnd`. */
  until: string;
  noEnd: boolean;
}

const CHOICES: readonly { choice: RepeatChoice; label: string }[] = [
  { choice: "once", label: "Uma vez" },
  { choice: "installments", label: "Parcelado" },
  { choice: "recurring", label: "Recorrente" },
];

export function initialRepeat(date: string): RepeatFields {
  return {
    choice: "once",
    count: "3",
    firstDue: date,
    frequency: "monthly",
    day: String(Number(date.slice(8, 10))),
    until: "",
    noEnd: true,
  };
}

/** The rule the fields describe, or a message saying what is missing. */
export function repeatFromFields(fields: RepeatFields, date: string): SeriesRepeat | string | null {
  if (fields.choice === "once") return null;
  if (fields.choice === "installments") {
    const count = Number(fields.count);
    if (!Number.isInteger(count) || count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS) {
      return `Informe de ${MIN_INSTALLMENTS} a ${MAX_INSTALLMENTS} parcelas.`;
    }
    if (fields.firstDue === "") return "Informe quando vence a primeira parcela.";
    if (fields.firstDue < date) return "A primeira parcela não pode vencer antes da data";
    return { mode: "installments", count, frequency: fields.frequency, startsOn: fields.firstDue };
  }
  const monthly = fields.frequency === "monthly";
  const day = Number(fields.day);
  if (monthly && (!Number.isInteger(day) || day < 1 || day > 31)) return "Informe o dia (1 a 31).";
  const startsOn = monthly ? firstMonthlyOnOrAfter(date, day) : date;
  if (!fields.noEnd && fields.until === "") return "Informe até quando repete, ou marque sem fim.";
  if (!fields.noEnd && fields.until < startsOn) return "A recorrência termina antes da primeira conta.";
  return {
    mode: "recurring",
    frequency: fields.frequency,
    dayOfMonth: monthly ? day : undefined,
    startsOn,
    endsOn: fields.noEnd ? undefined : fields.until,
  };
}

/** "05/10", or "05/10/2027" when the dates shown cross a year. */
const shortDate = (iso: string, withYear: boolean) => (withYear ? formatDate(iso) : formatDate(iso).slice(0, 5));
const crossesYear = (isos: string[]) => new Set(isos.map((iso) => iso.slice(0, 4))).size > 1;

export function RepeatSection({
  fields,
  onChange,
  date,
  amount,
}: {
  fields: RepeatFields;
  onChange(patch: Partial<RepeatFields>): void;
  date: string;
  /** Valor as parsed (NaN while empty). */
  amount: number;
}) {
  const repeat = date === "" ? null : repeatFromFields(fields, date);
  const valid = repeat !== null && typeof repeat !== "string" ? repeat : null;

  return (
    <fieldset className="grid min-w-0 gap-3 border-t border-hairline pt-4">
      <legend className="float-left w-full text-sm font-semibold text-ink">Repetir</legend>
      <div
        role="radiogroup"
        aria-label="Repetir"
        className="flex items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5"
      >
        {CHOICES.map(({ choice, label }) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={fields.choice === choice}
            onClick={() => onChange({ choice })}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-[13px] whitespace-nowrap transition-colors md:min-h-8",
              fields.choice === choice
                ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]"
                : "text-ink-soft hover:text-ink"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {fields.choice === "installments" ? (
        <>
          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 sm:grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="grid gap-1.5">
              <Label htmlFor="repeat-count">Parcelas</Label>
              <Input
                id="repeat-count"
                type="number"
                inputMode="numeric"
                min={MIN_INSTALLMENTS}
                max={MAX_INSTALLMENTS}
                value={fields.count}
                onChange={(e) => onChange({ count: e.target.value })}
                className="min-h-11 font-mono md:min-h-0"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="repeat-first">Primeira parcela vence</Label>
              <Input
                id="repeat-first"
                type="date"
                value={fields.firstDue}
                onChange={(e) => onChange({ firstDue: e.target.value })}
                className="min-h-11 font-mono md:min-h-0"
              />
            </div>
            <div className="col-span-2 grid gap-1.5 sm:col-span-1">
              <Label htmlFor="repeat-interval">Intervalo</Label>
              <Select value={fields.frequency} onValueChange={(v) => onChange({ frequency: v as SeriesFrequency })}>
                <SelectTrigger id="repeat-interval" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">mensal</SelectItem>
                  <SelectItem value="weekly">semanal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {valid?.mode === "installments" ? (
            <InstallmentPreview repeat={valid} amount={amount} />
          ) : null}
        </>
      ) : null}

      {fields.choice === "recurring" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="repeat-frequency">Repete a cada</Label>
              <Select value={fields.frequency} onValueChange={(v) => onChange({ frequency: v as SeriesFrequency })}>
                <SelectTrigger id="repeat-frequency" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">mês</SelectItem>
                  <SelectItem value="weekly">semana</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {fields.frequency === "monthly" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="repeat-day">no dia</Label>
                <Input
                  id="repeat-day"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={fields.day}
                  onChange={(e) => onChange({ day: e.target.value })}
                  className="min-h-11 font-mono md:min-h-0"
                />
              </div>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="repeat-until">até</Label>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                id="repeat-until"
                type="date"
                value={fields.until}
                disabled={fields.noEnd}
                onChange={(e) => onChange({ until: e.target.value })}
                className="min-h-11 w-auto min-w-0 flex-1 font-mono md:min-h-0"
              />
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink md:min-h-0">
                <input
                  type="checkbox"
                  role="switch"
                  checked={fields.noEnd}
                  onChange={(e) => onChange({ noEnd: e.target.checked })}
                  className="size-4 accent-brand"
                />
                sem fim
              </label>
            </div>
          </div>
          {valid?.mode === "recurring" ? <RecurringPreview repeat={valid} /> : null}
        </>
      ) : null}

      {typeof repeat === "string" && fields.choice !== "once" ? (
        <p className="text-xs text-ink-soft">{repeat}</p>
      ) : null}
    </fieldset>
  );
}

/** The parcelas with their vencimentos and values; Parcelar shows the same list. */
export function InstallmentPreview({ repeat, amount }: { repeat: SeriesRepeat; amount: number }) {
  const count = repeat.count ?? 0;
  const typed = Number.isFinite(amount) && amount > 0;
  const total = typed ? amount : 0;
  const plan = installmentPlan(total, count, repeat.startsOn, repeat.frequency);
  const withYear = crossesYear(plan.map((line) => line.dueDate));
  const money = (value: number) => (typed ? formatCurrency(value) : "—");
  return (
    <>
      <p className="text-xs text-ink-soft">
        O valor total é dividido em {count} parcelas, cada uma com seu vencimento em Contas.
      </p>
      <div className="overflow-hidden rounded-lg border border-hairline">
        <ol aria-label="Parcelas" className="max-h-56 overflow-y-auto">
          {plan.map((line) => (
            <li
              key={line.index}
              className={cn("flex min-h-9 items-center gap-2.5 px-3", line.index > 1 && "border-t border-hairline")}
            >
              <span className="inline-flex shrink-0 items-center rounded-md border border-hairline bg-surface px-1.5 font-mono text-[11px] leading-4 font-medium text-ink">
                {line.index}/{count}
              </span>
              <span className="font-mono text-[13px] text-ink">{shortDate(line.dueDate, withYear)}</span>
              <span className="text-xs text-ink-soft">vence</span>
              <span className="ml-auto font-mono text-[13px] font-medium text-ink">
                {money(line.amountBrl)}
              </span>
            </li>
          ))}
        </ol>
        <div className="flex items-center justify-between gap-2 border-t border-hairline bg-surface px-3 py-2">
          <span className="text-xs text-ink-soft">a última parcela absorve os centavos</span>
          <span className="text-[13px] font-semibold text-ink">
            Total <span className="font-mono">{money(total)}</span>
          </span>
        </div>
      </div>
    </>
  );
}

function RecurringPreview({ repeat }: { repeat: SeriesRepeat }) {
  const rule = { frequency: repeat.frequency, dayOfMonth: repeat.dayOfMonth, startsOn: repeat.startsOn, endsOn: repeat.endsOn };
  const next = nextDueDates(rule, 3);
  const until = repeat.endsOn;
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-soft">
      <Repeat className="size-3.5" aria-hidden />
      <span>próximas:</span>
      <span className="font-mono text-ink">
        {next.map((iso) => shortDate(iso, crossesYear(next))).join(" · ")}
      </span>
      <span className="basis-full">
        {until
          ? `${recurringDates(rule, 1, until).length} contas até ${monthYear(until)}, cada uma aparece em Contas perto do vencimento`
          : "sem fim · Contas mostra as contas dos próximos 12 meses"}
      </span>
    </p>
  );
}
