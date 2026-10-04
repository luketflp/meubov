"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { useToast } from "@/components/providers/Toasts";
import { safraOf } from "@/lib/domain/budget";
import { todayISO } from "@/lib/domain/dates";
import type { FarmData } from "@/lib/types";

/**
 * The registration fields and the safra's first month, this one only once the
 * user picks it; the sede is saved from the map, not from here.
 */
type FarmRegistration = Omit<FarmData, "headquarters" | "safraStartMonth"> & { safraStartMonth?: number };

interface FarmField {
  key: Exclude<keyof FarmRegistration, "safraStartMonth">;
  label: string;
  mono: boolean;
}

const FIELDS: readonly FarmField[] = [
  { key: "name", label: "Nome", mono: false },
  { key: "municipality", label: "Município", mono: false },
  { key: "stateRegistration", label: "Inscrição estadual", mono: true },
  { key: "manager", label: "Responsável", mono: false },
];

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/** Edit form for the farm's registration data and "Início da safra". */
export function FarmDataForm() {
  const farm = useHerdStore((s) => s.farm);
  const saveFarm = useHerdStore((s) => s.saveFarm);
  const canEdit = useCan("farm", "edit");
  // Moving the início regroups the orçamento's months: the server asks Financeiro edit for it.
  const canEditFinance = useCan("finance", "edit");
  const { addToast } = useToast();
  // Copied field by field so the payload carries no `headquarters` key.
  const [form, setForm] = useState<FarmRegistration>(() => ({
    name: farm.name,
    municipality: farm.municipality,
    stateRegistration: farm.stateRegistration,
    manager: farm.manager,
  }));
  // An offline snapshot from before the orçamento has no início da safra.
  const savedStart = farm.safraStartMonth ?? 10;
  // The warning reads the current safra's budgets, loaded here when absent for
  // whoever sees the Financeiro (ponytail: budgets only in other safras do not
  // warn; ask the server for a count if that matters).
  const canSeeBudgets = useCan("finance", "view");
  const loadBudgets = useHerdStore((s) => s.loadBudgets);
  const currentSafra = safraOf(todayISO(), savedStart);
  const savedBudgets = useHerdStore((s) => s.budgets[currentSafra]);
  const budgetsMissing = savedBudgets === undefined;
  useEffect(() => {
    // A failed load (or no signal) only leaves the warning out.
    if (canSeeBudgets && budgetsMissing) loadBudgets(currentSafra).catch(() => {});
  }, [canSeeBudgets, budgetsMissing, currentSafra, loadBudgets]);

  const start = form.safraStartMonth ?? savedStart;
  const startChanged = start !== savedStart;
  const hasChange = startChanged || FIELDS.some(({ key }) => form[key] !== farm[key]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasChange) return;
    // Registration fields and the start month only: sending no `headquarters`
    // is what tells the server to leave the map view alone. The início goes
    // only when moved here, so a form opened before another session moved it
    // never puts the old one back.
    const { safraStartMonth, ...registration } = form;
    await saveFarm(startChanged ? { ...registration, safraStartMonth } : registration);
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
              readOnly={!canEdit}
              className={mono ? "font-mono" : undefined}
            />
          </div>
        ))}
        <div className="grid content-start gap-1.5">
          <Label htmlFor="farm-safraStartMonth">Início da safra</Label>
          {canEditFinance ? (
            <Select
              value={String(start)}
              onValueChange={(value) => setForm((current) => ({ ...current, safraStartMonth: Number(value) }))}
              disabled={!canEdit}
            >
              <SelectTrigger id="farm-safraStartMonth" className="min-h-11 w-full md:min-h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((name, index) => (
                  <SelectItem key={name} value={String(index + 1)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input id="farm-safraStartMonth" value={MONTH_NAMES[start - 1]} readOnly />
          )}
          <p className="text-xs text-ink-soft">
            A safra vai de {MONTH_NAMES[start - 1]} a {MONTH_NAMES[(start + 10) % 12]}.
            {canEditFinance ? null : " Quem edita o Financeiro muda o início."}
          </p>
          {startChanged && (savedBudgets?.length ?? 0) > 0 ? (
            <p role="status" className="text-xs text-attention">
              Os orçamentos guardam seus meses do calendário: mudar o início da safra redistribui-os entre as safras.
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={!hasChange} className="min-h-11 md:min-h-0">
              Salvar
            </Button>
          </div>
        ) : null}
      </form>
    </SectionCard>
  );
}
