"use client";

/**
 * The safra the Orçamento shows: the one before the current, the current and
 * the next, plus the one in the URL when it lies further away.
 */
import { CalendarRange } from "lucide-react";
import { safraLabel } from "@/lib/domain/budget";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SafraPickerProps {
  value: number;
  /** The safra holding today. */
  current: number;
  startMonth: number;
  onChange(safra: number): void;
}

export function SafraPicker({ value, current, startMonth, onChange }: SafraPickerProps) {
  const options = [...new Set([current - 1, current, current + 1, value])].sort((a, b) => a - b);
  return (
    <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
      <SelectTrigger aria-label="Safra" className="min-h-11 flex-1 sm:flex-none md:min-h-8">
        <span className="flex items-center gap-2">
          <CalendarRange className="text-ink-soft" aria-hidden />
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((safra) => (
          <SelectItem key={safra} value={String(safra)}>
            {safraLabel(safra, startMonth)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
