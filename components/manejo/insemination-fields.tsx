"use client";

/**
 * What only an inseminação asks when it starts: the touro principal, with the
 * doses each registered bull has left, and the notice when that bull cannot
 * cover the cows picked. The "Iniciar manejo" dialog keeps the lote and the cow
 * list, which it shares with every other manejo. The doses come from
 * {@link useSemenStock}, the same count the brete draws its bull chips from.
 */
import { formatNumber } from "@/lib/domain/format";
import { AttentionNotice } from "@/components/semen/attention-notice";
import { dosesLabel } from "@/components/semen/stock-pill";
import { useSemenStock } from "@/components/semen/use-semen-stock";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface MainBullFieldProps {
  /** Bull id; empty string until one is picked. */
  value: string;
  onChange: (bullId: string) => void;
  error?: string;
  className?: string;
}

/**
 * "Touro principal": a bull with no dose left cannot be picked. With no bull
 * registered the field says where to register one, and the dialog keeps its
 * submit disabled.
 */
export function MainBullField({ value, onChange, error, className }: MainBullFieldProps) {
  const { bulls, dosesLeft } = useSemenStock();
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={bulls.length > 0 ? "manejo-bull" : undefined}>Touro principal</Label>
      {bulls.length === 0 ? (
        <p className="text-sm text-ink-soft">Cadastre um touro na aba Touros da Reprodução.</p>
      ) : (
        <>
          <Select value={value === "" ? undefined : value} onValueChange={onChange}>
            <SelectTrigger
              id="manejo-bull"
              className="min-h-11 w-full"
              aria-invalid={error ? true : undefined}
            >
              <SelectValue placeholder="Selecione o touro" />
            </SelectTrigger>
            <SelectContent>
              {bulls.map((bull) => {
                const left = dosesLeft(bull.id);
                return (
                  <SelectItem key={bull.id} value={bull.id} disabled={left <= 0}>
                    {bull.name}
                    <span className="text-ink-soft">
                      · {left <= 0 ? "sem doses" : dosesLabel(left)}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-xs text-ink-soft">
            Já vem marcado em cada vaca no brete; dá para trocar ali.
          </p>
        </>
      )}
      {error ? <p className="text-xs text-overdue">{error}</p> : null}
    </div>
  );
}

/**
 * "Tufão da Serra tem 19 doses para 32 vacas…": shown while the touro principal
 * has fewer doses than cows picked. Not an error — the brete switches bulls.
 */
export function MainBullShortNotice({ bullId, cows }: { bullId: string; cows: number }) {
  const { bulls, dosesLeft } = useSemenStock();
  const bull = bulls.find((item) => item.id === bullId);
  const left = dosesLeft(bullId);
  if (!bull || cows <= left) return null;
  return (
    <AttentionNotice className="text-xs">
      {bull.name} tem {dosesLabel(left)} para {formatNumber(cows)}{" "}
      {cows === 1 ? "vaca" : "vacas"}. No brete, troque de touro quando acabar.
    </AttentionNotice>
  );
}
