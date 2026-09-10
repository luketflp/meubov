"use client";

/**
 * Search box plus the list of active females, for the screens that record a
 * write on a matriz without starting from her ficha (Nascimentos, Coberturas):
 * the caller shows the picker first and moves on to its form once a dam is
 * chosen.
 *
 * Only active females are listed; the calving and breeding APIs refuse
 * anything else, and a female that already left the herd is no longer calving
 * or being bred on this farm.
 */
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { activeAnimals } from "@/lib/store/selectors";
import type { Animal } from "@/lib/types";
import { formatAge } from "@/lib/domain/dates";
import { animalCategoryName } from "@/lib/domain/labels";
import { Input } from "@/components/ui/input";

interface DamPickerProps {
  /** Called with the chosen female. */
  onPick: (dam: Animal) => void;
}

export function DamPicker({ onPick }: DamPickerProps) {
  const animals = useHerdStore((s) => s.animals);
  const lots = useHerdStore((s) => s.lots);
  const customCategories = useHerdStore((s) => s.customCategories);

  const [search, setSearch] = useState("");

  const lotNameById = useMemo(
    () => new Map(lots.map((lot) => [lot.id, lot.name])),
    [lots]
  );
  const dams = useMemo(() => {
    const term = search.trim().toLowerCase();
    return activeAnimals(animals)
      .filter(
        (animal) =>
          animal.sex === "female" &&
          (term === "" || animal.earTag.toLowerCase().includes(term))
      )
      .sort((a, b) => a.earTag.localeCompare(b.earTag));
  }, [animals, search]);

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar brinco"
          aria-label="Buscar matriz por brinco"
          className="min-h-11 pl-9 font-mono md:min-h-9"
        />
      </div>

      {dams.length === 0 ? (
        <p className="px-1 py-2 text-xs text-ink-soft">
          Nenhuma matriz ativa com esse brinco.
        </p>
      ) : (
        <ul className="max-h-64 overflow-y-auto rounded-lg border border-hairline">
          {dams.map((animal) => (
            <li key={animal.id} className="border-b border-hairline last:border-b-0">
              <button
                type="button"
                onClick={() => onPick(animal)}
                className="flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-brand-soft/50"
              >
                <span className="font-mono font-medium text-ink">
                  {animal.earTag}
                </span>
                <span className="truncate text-xs text-ink-soft">
                  {animalCategoryName(animal, customCategories)} ·{" "}
                  {formatAge(animal.birthDate)}
                </span>
                <span className="ml-auto shrink-0 truncate text-xs text-ink-soft">
                  {lotNameById.get(animal.lotId) ?? "Sem lote"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
