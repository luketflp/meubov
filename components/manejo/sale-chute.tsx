"use client";

/**
 * The brete of a venda: the animal on the scale goes to the Boiada (sold now,
 * at its own rendimento), to the Dúvida (decided before the venda closes) or
 * to the Refugo (stays on the farm). Enter sends it to the Boiada.
 */
import { useState, type ComponentType, type FormEvent } from "react";
import { CircleHelp, House, Truck } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import type { Animal, ManejoSession, ManejoSessionAnimal } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/domain/labels";
import { carcassArrobas, currentWeight, DEFAULT_CARCASS_YIELD_PCT } from "@/lib/domain/weights";
import { formatArroba, formatCurrency, formatKg, formatPercent } from "@/lib/domain/format";
import { saleAmount } from "@/lib/domain/movements";
import { breedLabel, ChuteEditAnimal } from "@/components/manejo/chute-animal";
import { boiadaPassData } from "@/components/manejo/helpers";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

/**
 * What the card opens filled with: the weight and note a dúvida carried back
 * to the brete, or everything typed before a brinco edit remounted the card.
 */
export interface SaleChutePrefill {
  weightText?: string;
  notes?: string;
  /** Rendimento typed by the operator; absent follows the venda's padrão. */
  yieldText?: string;
}

interface SaleChuteCardProps {
  session: ManejoSession;
  entry: ManejoSessionAnimal;
  animal: Animal | undefined;
  prefill?: SaleChutePrefill;
  /** The rendimento field: a venda per arroba, and Financeiro edit. */
  setsYield: boolean;
  onDone: () => void;
  /** After a brinco edit: the new tag and what was typed, to open it filled. */
  onSaved: (earTag: string, typed: SaleChutePrefill) => void;
}

/** A positive number typed in a field (decimal comma accepted), else null. */
function parsePositive(text: string): number | null {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() === "" || !Number.isFinite(value) || value <= 0 ? null : value;
}

export function SaleChuteCard({
  session,
  entry,
  animal,
  prefill,
  setsYield,
  onDone,
  onSaved,
}: SaleChuteCardProps) {
  const completeManejoAnimal = useHerdStore((s) => s.completeManejoAnimal);
  const setAsideManejoAnimal = useHerdStore((s) => s.setAsideManejoAnimal);
  const skipManejoAnimal = useHerdStore((s) => s.skipManejoAnimal);

  const padrao = session.carcassYieldPct ?? DEFAULT_CARCASS_YIELD_PCT;
  const [weight, setWeight] = useState(prefill?.weightText ?? "");
  const [note, setNote] = useState(prefill?.notes ?? "");
  /** What the operator typed in Rendimento; null follows the venda's padrão. */
  const [typedYieldText, setYieldText] = useState<string | null>(prefill?.yieldText ?? null);
  const [error, setError] = useState<string | null>(null);
  /** True while a pass is in flight — a chute action must not double-fire. */
  const [busy, setBusy] = useState(false);

  const perArroba = session.pricePerArroba !== undefined;
  const passWeight = parsePositive(weight);
  const yieldText = typedYieldText ?? String(padrao).replace(".", ",");
  const typedYield = parsePositive(yieldText);
  const yieldValid = typedYield !== null && typedYield <= 100;
  // The animal's own rendimento: what the field holds, when it may be set.
  const yieldPct = setsYield && yieldValid ? typedYield : padrao;
  const adjusted = setsYield && yieldPct !== padrao;
  const passValue =
    session.pricePerArroba !== undefined && passWeight !== null
      ? saleAmount(passWeight, session.pricePerArroba, yieldPct)
      : null;
  const notes = note.trim() === "" ? undefined : note.trim();

  async function onBoiada(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (session.weighing && passWeight === null) {
      setError("Informe o peso (kg) do animal na balança.");
      return;
    }
    if (setsYield && !yieldValid) {
      setError("Rendimento entre 1 e 100%.");
      return;
    }
    setBusy(true);
    try {
      const saved = await completeManejoAnimal(
        session.id,
        entry.earTag,
        boiadaPassData({
          weighing: session.weighing,
          weightKg: passWeight,
          notes,
          setsYield,
          yieldPct,
          padraoPct: padrao,
        })
      );
      if (saved) onDone();
    } finally {
      setBusy(false);
    }
  }

  // Refugo and dúvida passed the scale too: the weight, when read, is kept.
  async function onSetAside(list: "rejected" | "held") {
    if (busy) return;
    setBusy(true);
    try {
      const saved = await setAsideManejoAnimal(session.id, entry.earTag, {
        list,
        weightKg: passWeight ?? undefined,
        notes,
      });
      if (saved) onDone();
    } finally {
      setBusy(false);
    }
  }

  async function onSkip() {
    if (busy) return;
    setBusy(true);
    try {
      await skipManejoAnimal(session.id, entry.earTag, notes);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="No brete agora"
      action={<span className="hidden text-xs text-ink-soft md:inline">Enter = Boiada</span>}
    >
      <div className="space-y-4">
        {/* Outside the chute form: the edit dialog's own submit would bubble
            through the portal into it and send the animal to the boiada. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-3xl font-semibold text-ink">{entry.earTag}</span>
          {animal ? (
            <span className="text-sm text-ink-soft">
              {CATEGORY_LABEL[animal.category]}
              {" · "}
              {breedLabel(animal)}
              {" · último peso: "}
              {(() => {
                const last = currentWeight(animal);
                return last === null ? "sem pesagem" : formatKg(last);
              })()}
            </span>
          ) : null}
          {animal ? (
            <ChuteEditAnimal
              key={animal.id}
              sessionId={session.id}
              animal={animal}
              // The new brinco remounts the card: carry what was typed into it.
              onSaved={(earTag) =>
                onSaved(earTag, {
                  weightText: weight,
                  notes: note,
                  yieldText: typedYieldText ?? undefined,
                })
              }
              onBaixa={onDone}
            />
          ) : null}
        </div>

        <form onSubmit={onBoiada} className="space-y-4">
          <div
            className={cn("grid gap-4", setsYield ? "grid-cols-2 sm:grid-cols-3" : "sm:grid-cols-2")}
          >
            {session.weighing ? (
              <div className="grid gap-1.5">
                <Label htmlFor="pass-weight">Peso na balança (kg)</Label>
                <Input
                  id="pass-weight"
                  type="number"
                  min={1}
                  step="0.1"
                  inputMode="decimal"
                  autoFocus
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="kg"
                  aria-invalid={error ? true : undefined}
                  className="min-h-11 font-mono text-lg"
                />
              </div>
            ) : null}
            {setsYield ? (
              <div className="grid gap-1.5">
                <Label htmlFor="pass-yield">Rendimento (%)</Label>
                <div className="relative">
                  <Input
                    id="pass-yield"
                    inputMode="decimal"
                    value={yieldText}
                    onChange={(e) => setYieldText(e.target.value)}
                    className={cn("min-h-11 font-mono text-lg", adjusted && "border-attention pr-24")}
                  />
                  {adjusted ? (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-attention-soft px-2 py-0.5 text-[11px] font-medium text-attention">
                      ajustado
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-ink-soft">
                  Padrão da venda {formatPercent(padrao)}
                  {adjusted ? (
                    <>
                      {" · "}
                      <button
                        type="button"
                        className="font-medium text-brand hover:underline"
                        onClick={() => setYieldText(null)}
                      >
                        voltar ao padrão
                      </button>
                    </>
                  ) : null}
                </p>
              </div>
            ) : null}
            <div
              className={cn(
                "grid gap-1.5",
                setsYield ? "col-span-2 sm:col-span-1" : !session.weighing && "sm:col-span-2"
              )}
            >
              <Label htmlFor="pass-note">Observação (opcional)</Label>
              <Input
                id="pass-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex.: acabamento, casco…"
                className="min-h-11"
              />
            </div>
          </div>

          {perArroba ? (
            <p className="text-sm text-ink-soft">
              {passWeight === null || session.pricePerArroba === undefined ? (
                "Digite o peso para calcular o valor deste animal."
              ) : (
                <>
                  {formatArroba(carcassArrobas(passWeight, yieldPct))} de carcaça (rend.{" "}
                  {formatPercent(yieldPct)}) × {formatCurrency(session.pricePerArroba)}/@ ={" "}
                  <span className="font-mono font-medium text-ink">
                    {formatCurrency(passValue ?? 0)}
                  </span>
                </>
              )}
            </p>
          ) : null}
          {error ? <p className="text-xs text-overdue">{error}</p> : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr]">
            <button
              type="submit"
              disabled={busy}
              className="col-span-2 flex min-h-16 items-center gap-3 rounded-xl bg-brand px-4 text-left text-white disabled:opacity-60 sm:col-span-1"
            >
              <Truck className="size-5.5 shrink-0" aria-hidden />
              <span className="flex flex-col">
                <span className="text-base font-semibold">Boiada</span>
                <span className="text-xs opacity-90">
                  {passValue !== null ? `Vende agora · ${formatCurrency(passValue)}` : "Vende agora"}
                </span>
              </span>
            </button>
            <SortButton
              tone="attention"
              icon={CircleHelp}
              label="Dúvida"
              sub="Aparta, decide depois"
              onClick={() => onSetAside("held")}
              disabled={busy}
            />
            <SortButton
              tone="fmd"
              icon={House}
              label="Refugo"
              sub="Fica na fazenda"
              onClick={() => onSetAside("rejected")}
              disabled={busy}
            />
          </div>
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className="min-h-11 text-sm font-medium text-ink-soft hover:text-ink disabled:opacity-60"
          >
            Pular (não passou)
          </button>
        </form>
      </div>
    </SectionCard>
  );
}

const SORT_TONE = {
  attention: "border-attention/20 bg-attention-soft text-attention",
  fmd: "border-fmd/20 bg-fmd-soft text-fmd",
} as const;

/** The Dúvida and Refugo porteiras: an animal set apart from the boiada. */
function SortButton({
  tone,
  icon: Icon,
  label,
  sub,
  onClick,
  disabled,
}: {
  tone: keyof typeof SORT_TONE;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  sub: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-xl border px-4 text-left disabled:opacity-60",
        SORT_TONE[tone]
      )}
    >
      <Icon className="size-5.5 shrink-0" aria-hidden />
      <span className="flex flex-col">
        <span className="text-base font-semibold">{label}</span>
        <span className="text-xs text-ink">{sub}</span>
      </span>
    </button>
  );
}
