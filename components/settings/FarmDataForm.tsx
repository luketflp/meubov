"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import type { FarmData } from "@/lib/types";

/** The registration fields; the sede is saved from the map, not from here. */
type FarmRegistration = Omit<FarmData, "headquarters">;

interface FarmField {
  key: keyof FarmRegistration;
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
  const { addToast } = useToast();
  // Copied field by field so the payload carries no `headquarters` key.
  const [form, setForm] = useState<FarmRegistration>(() => ({
    name: farm.name,
    municipality: farm.municipality,
    stateRegistration: farm.stateRegistration,
    manager: farm.manager,
  }));

  const hasChange = FIELDS.some(({ key }) => form[key] !== farm[key]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasChange) return;
    // Registration fields only: sending no `headquarters` is what tells the
    // server to leave the map view alone.
    await saveFarm(form);
    addToast({ messageType: "success", text: "Dados da fazenda salvos" });
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
        </div>
      </form>
    </SectionCard>
  );
}
