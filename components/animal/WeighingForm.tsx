"use client";

/**
 * Animal weighing registration form: date (defaults to today) and weight in kg.
 * Saves via useHerdStore.recordWeighing; the record reacts instantly.
 */
import { type FormEvent, useState } from "react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { todayISO } from "@/lib/domain/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface WeighingFormProps {
  earTag: string;
}

export function WeighingForm({ earTag }: WeighingFormProps) {
  const recordWeighing = useHerdStore((s) => s.recordWeighing);
  const { addToast } = useToast();
  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ISO_DATE_PATTERN.test(date)) {
      setError("Informe uma data válida.");
      return;
    }
    const weightKg = Number(weight);
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      setError("Informe um peso maior que zero.");
      return;
    }
    await recordWeighing(earTag, { date, weightKg });
    addToast({ messageType: "success", text: `Pesagem de ${earTag} registrada` });
    setWeight("");
    setError(null);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-4"
    >
      <h3 className="text-sm font-semibold text-ink">Registrar pesagem</h3>

      <div className="space-y-1.5">
        <Label htmlFor="weighing-date">Data</Label>
        <Input
          id="weighing-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="min-h-11 font-mono"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="weighing-weight">Peso (kg)</Label>
        <Input
          id="weighing-weight"
          type="number"
          inputMode="decimal"
          min="1"
          step="0.5"
          placeholder="Ex.: 480"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="min-h-11 font-mono"
        />
      </div>

      {error ? <p className="text-xs font-medium text-overdue">{error}</p> : null}

      <Button type="submit" className="min-h-11 w-full">
        Registrar
      </Button>
    </form>
  );
}
