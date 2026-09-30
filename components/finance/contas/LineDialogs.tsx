"use client";

/**
 * The three questions a linha do extrato may ask: which other lançamento it
 * confirms ("Outro lançamento"), to which conta a transferência went ("É
 * transferência"), and why it is ignored ("Ignorar").
 */
import { useState, type ReactNode } from "react";
import type { BankAccount, StatementLine } from "@/lib/types";
import { bankAccountLabel } from "@/lib/domain/bankAccounts";
import { formatCurrency } from "@/lib/domain/format";
import { candidatesByValue, type Candidate, type MatchTarget, type Suggestion } from "@/lib/domain/statements/match";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Reasons offered by "Ignorar"; "outro" asks for the text. */
export const IGNORE_REASONS = ["tarifa já lançada", "duplicada", "outro"] as const;

function Shell({
  title,
  description,
  busy,
  onClose,
  onConfirm,
  confirmLabel,
  canConfirm,
  children,
}: {
  title: string;
  description: string;
  busy: boolean;
  onClose(): void;
  onConfirm(): void;
  confirmLabel: string;
  canConfirm: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="min-h-11 md:min-h-9" disabled={busy}>
              Cancelar
            </Button>
          </DialogClose>
          <Button type="button" className="min-h-11 md:min-h-9" disabled={busy || !canConfirm} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const lineText = (line: StatementLine) => `${line.description} · ${formatCurrency(line.amountBrl)}`;

/**
 * "Outro lançamento": every candidate of the line's side and value ±5 days,
 * then a search by value. A pending lançamento of another value is paid at the
 * line's (the dialog says so); anything already settled at another value
 * cannot confirm it.
 */
export function OtherMatchDialog({
  line,
  suggestions,
  candidates,
  describe,
  busy,
  onClose,
  onPick,
}: {
  line: StatementLine;
  suggestions: Suggestion[];
  candidates: Candidate[];
  describe(c: Candidate): { title: string; detail: string };
  busy: boolean;
  onClose(): void;
  onPick(target: MatchTarget): void;
}) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const value = parseAmount(search);
  const found = Number.isFinite(value) && value > 0 ? candidatesByValue(line, candidates, value) : [];
  const listed = [...suggestions.map((s) => s.candidate), ...found.filter((c) => !suggestions.some((s) => s.candidate === c))];
  const lineCents = Math.round(Math.abs(line.amountBrl) * 100);
  const differs = (c: Candidate) => Math.round(c.amountBrl * 100) !== lineCents;
  const pickedCandidate = listed.find((c) => c.target.id === picked);
  const target = pickedCandidate?.target;

  return (
    <Shell
      title="Outro lançamento"
      description={lineText(line)}
      busy={busy}
      onClose={onClose}
      onConfirm={() => target && onPick(target)}
      confirmLabel="Confirmar"
      canConfirm={target !== undefined}
    >
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="other-search">Buscar por valor (R$)</Label>
          <Input
            id="other-search"
            inputMode="decimal"
            placeholder="0,00"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-11 font-mono md:min-h-9"
          />
        </div>
        {listed.length === 0 ? (
          <p className="text-sm text-ink-soft">Nenhum lançamento com esse valor.</p>
        ) : (
          <ul role="radiogroup" aria-label="Lançamentos" className="divide-y divide-hairline rounded-lg border border-hairline">
            {listed.map((c) => {
              const { title, detail } = describe(c);
              const locked = !c.pending && differs(c);
              return (
                <li key={c.target.id}>
                  <label
                    className={cn(
                      "flex min-h-11 items-start gap-3 px-3 py-2",
                      locked ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                      picked === c.target.id && "bg-brand-soft"
                    )}
                  >
                    <input
                      type="radio"
                      name="other-match"
                      checked={picked === c.target.id}
                      disabled={locked}
                      onChange={() => setPicked(c.target.id)}
                      className="mt-1 accent-brand"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{title}</span>
                      <span className="block text-xs text-ink-soft">
                        {detail}
                        {locked ? " · valor diferente" : null}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {pickedCandidate && differs(pickedCandidate) ? (
          <p className="text-xs text-attention">valor ajustado para {formatCurrency(Math.abs(line.amountBrl))}</p>
        ) : null}
      </div>
    </Shell>
  );
}

/** "É transferência": the other conta; money leaves this one on a saída and enters it on an entrada. */
export function TransferLineDialog({
  line,
  accounts,
  busy,
  onClose,
  onPick,
}: {
  line: StatementLine;
  accounts: BankAccount[];
  busy: boolean;
  onClose(): void;
  onPick(otherAccountId: string): void;
}) {
  const outflow = line.amountBrl < 0;
  // An entrada never comes from a cartão: it only receives its fatura.
  const options = accounts.filter(
    (a) => a.archivedAt === undefined && a.id !== line.bankAccountId && (outflow || a.kind !== "card")
  );
  const [other, setOther] = useState(options.find((a) => a.kind === "cash")?.id ?? options[0]?.id ?? "");
  return (
    <Shell
      title="É transferência"
      description={lineText(line)}
      busy={busy}
      onClose={onClose}
      onConfirm={() => onPick(other)}
      confirmLabel="Registrar transferência"
      canConfirm={other !== ""}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="transfer-line-other">{outflow ? "Para a conta" : "Da conta"}</Label>
        <Select value={other} onValueChange={setOther}>
          <SelectTrigger id="transfer-line-other" className="min-h-11 w-full">
            <SelectValue placeholder="Escolha a conta" />
          </SelectTrigger>
          <SelectContent>
            {options.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {bankAccountLabel(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-ink-soft">Não entra no resultado: é dinheiro mudando de lugar.</p>
      </div>
    </Shell>
  );
}

/** "Ignorar": tarifa já lançada, duplicada or another reason typed. */
export function IgnoreLineDialog({
  line,
  busy,
  onClose,
  onPick,
}: {
  line: StatementLine;
  busy: boolean;
  onClose(): void;
  onPick(reason: string): void;
}) {
  const [choice, setChoice] = useState<(typeof IGNORE_REASONS)[number]>("tarifa já lançada");
  const [other, setOther] = useState("");
  const reason = choice === "outro" ? other.trim() : choice;
  return (
    <Shell
      title="Ignorar linha"
      description={lineText(line)}
      busy={busy}
      onClose={onClose}
      onConfirm={() => onPick(reason)}
      confirmLabel="Ignorar"
      canConfirm={reason !== ""}
    >
      <div role="radiogroup" aria-label="Motivo" className="grid gap-1">
        {IGNORE_REASONS.map((r) => (
          <label key={r} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm md:min-h-8">
            <input type="radio" name="ignore-reason" checked={choice === r} onChange={() => setChoice(r)} className="accent-brand" />
            {r}
          </label>
        ))}
        {choice === "outro" ? (
          <Input
            aria-label="Motivo"
            autoFocus
            value={other}
            maxLength={120}
            onChange={(e) => setOther(e.target.value)}
            className="min-h-11 md:min-h-9"
          />
        ) : null}
      </div>
    </Shell>
  );
}
