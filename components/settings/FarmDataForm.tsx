"use client";

import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { useHerdStore } from "@/lib/store/useHerdStore";
import type { FarmData } from "@/lib/types";
import { useTemporaryMessage } from "./useTemporaryMessage";

interface FarmField {
  /** Only the free-text fields — headquarters (coordinates) is set via the map. */
  key: Exclude<keyof FarmData, "headquarters">;
  label: string;
  mono: boolean;
}

const FIELDS: readonly FarmField[] = [
  { key: "name", label: "Nome", mono: false },
  { key: "municipality", label: "Município", mono: false },
  { key: "stateRegistration", label: "Inscrição estadual", mono: true },
  { key: "manager", label: "Responsável", mono: false },
];

/** Edit form for the farm's registration data. */
export function FarmDataForm() {
  const farm = useHerdStore((s) => s.farm);
  const saveFarm = useHerdStore((s) => s.saveFarm);
  const [form, setForm] = useState<FarmData>(farm);
  const [feedback, showFeedback] = useTemporaryMessage(2000);

  const hasChange = FIELDS.some(({ key }) => form[key] !== farm[key]);

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasChange) return;
    saveFarm(form);
    showFeedback("Salvo");
  }

  return (
    <SectionCard title="Dados da fazenda">
      <form onSubmit={onSave} className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(({ key, label, mono }) => (
          <div key={key} className="grid gap-1.5">
            <Label htmlFor={`farm-${key}`}>{label}</Label>
            <Input
              id={`farm-${key}`}
              value={form[key]}
              onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
              className={mono ? "font-mono" : undefined}
            />
          </div>
        ))}
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={!hasChange} className="min-h-11 md:min-h-0">
            Salvar
          </Button>
          {feedback ? (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-healthy">
              <Check className="size-4" aria-hidden />
              {feedback}
            </span>
          ) : null}
        </div>
      </form>
    </SectionCard>
  );
}
