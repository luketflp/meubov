/**
 * Pieces the Ultrassom list and its brete share: the exam date field, which
 * both edit through the same state, the bull of a cobertura and the links
 * into and out of the brete.
 */
import type { UltrasoundRow } from "@/lib/domain/ultrasound";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const linkClass = "font-mono font-medium text-ink underline-offset-2 hover:underline";

/** The Ultrassom tab, leaving the brete. */
export const ULTRASOUND_HREF = "/reproducao?tab=ultrassom";

/** The brete of one lote, by its group key. */
export function ultrasoundBreteHref(groupKey: string): string {
  return `${ULTRASOUND_HREF}&brete=${encodeURIComponent(groupKey)}`;
}

/** "1 dia", "39 dias". */
export const daysText = (days: number): string => `${days} ${days === 1 ? "dia" : "dias"}`;

/** Why the exam date cannot take a tap yet; null when it can. */
export function examDateError(date: string, todayIso: string): string | null {
  if (!ISO_DATE_PATTERN.test(date)) return "Informe a data do diagnóstico.";
  if (date > todayIso) return "O diagnóstico não pode ser no futuro.";
  return null;
}

interface ExamDateFieldProps {
  id: string;
  value: string;
  todayIso: string;
  onChange: (value: string) => void;
}

/** "Data do exame" with its hint, which turns into the error while the date cannot take a tap. */
export function ExamDateField({ id, value, todayIso, onChange }: ExamDateFieldProps) {
  const error = examDateError(value, todayIso);
  return (
    <>
      <div className="grid gap-1.5 md:flex md:items-center md:gap-2.5">
        <Label htmlFor={id}>Data do exame</Label>
        <Input
          id={id}
          type="date"
          max={todayIso}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={`${id}-hint`}
          aria-invalid={error !== null}
          className="min-h-11 font-mono md:min-h-9 md:w-44"
        />
      </div>
      <p
        id={`${id}-hint`}
        className={cn("-mt-1.5 text-xs md:mt-0", error ? "text-overdue" : "text-ink-soft")}
      >
        {error ?? "Vale para todos os toques desta tela"}
      </p>
    </>
  );
}

/** The bull: a registered semen bull by name, a herd bull or a semen code by its tag. */
export function BullName({ row, className }: { row: UltrasoundRow; className?: string }) {
  if (row.bull !== null) {
    return <span className={cn("text-ink", className)}>{row.bull.name}</span>;
  }
  return (
    <span className={cn("font-mono text-ink", className)}>{row.breeding.bullEarTag}</span>
  );
}
