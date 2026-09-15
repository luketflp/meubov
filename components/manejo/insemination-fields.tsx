"use client";

/**
 * What only an inseminação asks when it starts: the touros of the morning, with
 * the doses each registered bull has left, and the notice when they cannot
 * cover the cows picked. The "Iniciar manejo" dialog keeps the lote and the cow
 * list, which it shares with every other manejo. The doses come from
 * {@link useSemenStock}, the same count the brete draws its bull chips from.
 */
import { inseminationBulls } from "@/lib/domain/semen";
import { AttentionNotice } from "@/components/semen/attention-notice";
import { BULL_CHIP_GRID, BullChip } from "@/components/semen/bull-chip";
import { shortDosesMessage } from "@/components/semen/helpers";
import { useSemenStock } from "@/components/semen/use-semen-stock";
import { cn } from "@/lib/utils";

interface BullsFieldProps {
  /** Bull ids in the order picked; empty until one is. */
  value: string[];
  onChange: (bullIds: string[]) => void;
  error?: string;
  className?: string;
}

/**
 * "Touros": one chip per registered bull, picked in any number; the brete
 * offers these and no other. A bull with no dose left cannot be picked. With
 * no bull registered the field says where to register one, and the dialog
 * keeps its submit disabled.
 */
export function BullsField({ value, onChange, error, className }: BullsFieldProps) {
  const { bulls, dosesLeft } = useSemenStock();
  const toggle = (bullId: string) =>
    onChange(value.includes(bullId) ? value.filter((id) => id !== bullId) : [...value, bullId]);
  return (
    <fieldset className={cn("grid gap-1.5", className)}>
      <legend className="mb-1.5 text-sm font-medium text-ink">Touros</legend>
      {bulls.length === 0 ? (
        <p className="text-sm text-ink-soft">Cadastre um touro na aba Touros da Reprodução.</p>
      ) : (
        <>
          <div className={BULL_CHIP_GRID}>
            {bulls.map((bull) => {
              const selected = value.includes(bull.id);
              return (
                <BullChip
                  key={bull.id}
                  bull={bull}
                  left={dosesLeft(bull.id)}
                  selected={selected}
                  // A picked bull can always be unpicked, even once its doses are gone.
                  disabled={!selected && dosesLeft(bull.id) <= 0}
                  onClick={() => toggle(bull.id)}
                />
              );
            })}
          </div>
          <p className="text-xs text-ink-soft">
            O primeiro escolhido já vem marcado em cada vaca no brete; dá para trocar ali.
          </p>
        </>
      )}
      {error ? <p className="text-xs text-overdue">{error}</p> : null}
    </fieldset>
  );
}

/**
 * "Tufão da Serra tem 19 doses para 32 vacas…": shown while the touros picked
 * have fewer doses together than cows. Not an error — the brete can skip cows.
 */
export function BullsShortNotice({ bullIds, cows }: { bullIds: string[]; cows: number }) {
  const { bulls, dosesLeft } = useSemenStock();
  const picked = inseminationBulls({ semenBullIds: bullIds }, bulls);
  const message = shortDosesMessage(
    picked.map((bull) => bull.name),
    picked.reduce((total, bull) => total + Math.max(0, dosesLeft(bull.id)), 0),
    cows
  );
  return message === null ? null : (
    <AttentionNotice className="text-xs">{message}</AttentionNotice>
  );
}
