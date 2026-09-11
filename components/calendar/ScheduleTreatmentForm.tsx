"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_LABEL, TREATMENT_TYPE_LABEL } from "@/lib/domain/labels";
import { activeAnimals } from "@/lib/store/selectors";
import { useHerdStore } from "@/lib/store/useHerdStore";
import type { Category, TreatmentType } from "@/lib/types";

const STANDALONE = "__standalone";
const CATEGORY_LIST = Object.keys(CATEGORY_LABEL) as Category[];
const TREATMENT_TYPES = Object.keys(TREATMENT_TYPE_LABEL) as TreatmentType[];

type TargetMode = "all" | "lot" | "category" | "animals";

interface ScheduleTreatmentFormProps {
  date: string;
  onCancel: () => void;
  onScheduled: (count: number) => void;
}

/** Schedules a protocol or a one-off treatment for an explicit herd target. */
export function ScheduleTreatmentForm({
  date,
  onCancel,
  onScheduled,
}: ScheduleTreatmentFormProps) {
  const animals = useHerdStore((state) => state.animals);
  const lots = useHerdStore((state) => state.lots);
  const protocols = useHerdStore((state) => state.protocols);
  const scheduleTreatments = useHerdStore((state) => state.scheduleTreatments);

  const herd = useMemo(() => activeAnimals(animals), [animals]);
  const activeLots = useMemo(() => {
    const occupied = new Set(herd.map((animal) => animal.lotId));
    return lots.filter((lot) => lot.deletedAt == null && occupied.has(lot.id));
  }, [herd, lots]);

  const [sourceId, setSourceId] = useState(protocols[0]?.id ?? STANDALONE);
  const [targetMode, setTargetMode] = useState<TargetMode>("all");
  const [lotId, setLotId] = useState(activeLots[0]?.id ?? "");
  const [category, setCategory] = useState<Category>("calf");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<TreatmentType>("vaccine");
  const [withdrawalDays, setWithdrawalDays] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const chosenProtocol = protocols.find((protocol) => protocol.id === sourceId);
  const visibleAnimals = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (term === "") return herd;
    return herd.filter((animal) => animal.earTag.toLowerCase().includes(term));
  }, [herd, search]);

  const targetAnimals = useMemo(() => {
    if (targetMode === "all") return herd;
    if (targetMode === "lot") return herd.filter((animal) => animal.lotId === lotId);
    if (targetMode === "category") {
      return herd.filter((animal) => animal.category === category);
    }
    const chosen = new Set(selectedIds);
    return herd.filter((animal) => chosen.has(animal.id));
  }, [category, herd, lotId, selectedIds, targetMode]);

  function toggleAnimal(id: string): void {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (targetAnimals.length === 0) {
      setError("Selecione pelo menos um animal ativo.");
      return;
    }

    const cleanName = name.trim();
    const withdrawal = Number(withdrawalDays);
    if (sourceId === STANDALONE && cleanName === "") {
      setError("Informe o nome do tratamento avulso.");
      return;
    }
    if (sourceId === STANDALONE && (!Number.isInteger(withdrawal) || withdrawal < 0)) {
      setError("Carência deve ser um número inteiro de dias (zero ou mais).");
      return;
    }
    if (sourceId !== STANDALONE && !chosenProtocol) {
      setError("Selecione um protocolo válido.");
      return;
    }

    setSaving(true);
    try {
      const count = await scheduleTreatments({
        date,
        animalIds: targetAnimals.map((animal) => animal.id),
        source:
          sourceId === STANDALONE
            ? { kind: "standalone", name: cleanName, type, withdrawalDays: withdrawal }
            : { kind: "protocol", protocolId: sourceId },
      });
      onScheduled(count);
    } catch {
      setError("Não foi possível criar os agendamentos. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="schedule-source">Tratamento</Label>
        <Select value={sourceId} onValueChange={setSourceId}>
          <SelectTrigger id="schedule-source" className="min-h-11 w-full md:min-h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {protocols.map((protocol) => (
              <SelectItem key={protocol.id} value={protocol.id}>
                {protocol.name}
              </SelectItem>
            ))}
            <SelectItem value={STANDALONE}>Tratamento avulso</SelectItem>
          </SelectContent>
        </Select>
        {chosenProtocol ? (
          <p className="text-xs text-ink-soft">
            {TREATMENT_TYPE_LABEL[chosenProtocol.type]} · carência de {chosenProtocol.withdrawalDays}{" "}
            {chosenProtocol.withdrawalDays === 1 ? "dia" : "dias"}
          </p>
        ) : null}
      </div>

      {sourceId === STANDALONE ? (
        <div className="grid gap-3 rounded-lg border border-hairline p-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="schedule-name">Nome</Label>
            <Input
              id="schedule-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Reforço de vacina"
              className="min-h-11 md:min-h-8"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="schedule-type">Tipo</Label>
            <Select
              value={type}
              onValueChange={(value) => setType(value as TreatmentType)}
            >
              <SelectTrigger id="schedule-type" className="min-h-11 w-full md:min-h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TREATMENT_TYPES.map((treatmentType) => (
                  <SelectItem key={treatmentType} value={treatmentType}>
                    {TREATMENT_TYPE_LABEL[treatmentType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="schedule-withdrawal">Carência (dias)</Label>
            <Input
              id="schedule-withdrawal"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={withdrawalDays}
              onChange={(event) => setWithdrawalDays(event.target.value)}
              className="min-h-11 font-mono md:min-h-8"
            />
          </div>
        </div>
      ) : null}

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium text-ink">Aplicar a</legend>
        <Select
          value={targetMode}
          onValueChange={(value) => setTargetMode(value as TargetMode)}
        >
          <SelectTrigger className="min-h-11 w-full md:min-h-8" aria-label="Destino do tratamento">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo o rebanho ativo</SelectItem>
            <SelectItem value="lot">Um lote</SelectItem>
            <SelectItem value="category">Uma categoria</SelectItem>
            <SelectItem value="animals">Animais selecionados</SelectItem>
          </SelectContent>
        </Select>

        {targetMode === "lot" ? (
          <Select value={lotId} onValueChange={setLotId}>
            <SelectTrigger className="min-h-11 w-full md:min-h-8" aria-label="Selecionar lote">
              <SelectValue placeholder="Selecione o lote" />
            </SelectTrigger>
            <SelectContent>
              {activeLots.map((lot) => (
                <SelectItem key={lot.id} value={lot.id}>
                  {lot.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {targetMode === "category" ? (
          <Select
            value={category}
            onValueChange={(value) => setCategory(value as Category)}
          >
            <SelectTrigger className="min-h-11 w-full md:min-h-8" aria-label="Selecionar categoria">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_LIST.map((item) => (
                <SelectItem key={item} value={item}>
                  {CATEGORY_LABEL[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {targetMode === "animals" ? (
          <div className="grid gap-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar brinco"
                aria-label="Buscar animal por brinco"
                className="min-h-11 pl-9 font-mono md:min-h-8"
              />
            </div>
            <ul className="max-h-44 overflow-y-auto rounded-lg border border-hairline">
              {visibleAnimals.map((animal) => (
                <li key={animal.id} className="border-b border-hairline last:border-b-0">
                  <label className="flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-brand-soft/50">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(animal.id)}
                      onChange={() => toggleAnimal(animal.id)}
                      className="size-4 shrink-0 accent-brand"
                    />
                    <span className="font-mono text-sm font-medium text-ink">
                      {animal.earTag}
                    </span>
                    <span className="truncate text-xs text-ink-soft">
                      {CATEGORY_LABEL[animal.category]}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-xs text-ink-soft">
          {targetAnimals.length === 1
            ? "1 animal receberá este agendamento."
            : `${targetAnimals.length} animais receberão este agendamento.`}
        </p>
      </fieldset>

      {error ? <p role="alert" className="text-sm text-overdue">{error}</p> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} className="min-h-11 md:min-h-8">
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={saving || targetAnimals.length === 0}
          className="min-h-11 md:min-h-8"
        >
          {saving ? "Agendando…" : "Confirmar agendamento"}
        </Button>
      </div>
    </form>
  );
}
