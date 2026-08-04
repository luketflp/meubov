"use client";

import { useMemo, useState } from "react";
import { SearchX } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { activeAnimals, withStatus } from "@/lib/store/selectors";
import { todayISO } from "@/lib/domain/dates";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/herd/FilterBar";
import { HerdTable } from "@/components/herd/HerdTable";
import { AnimalCard } from "@/components/herd/AnimalCard";
import { RegisterAnimalDialog } from "@/components/herd/RegisterAnimalDialog";
import { ImportHerdDialog } from "@/components/herd/ImportHerdDialog";
import {
  INITIAL_FILTERS,
  DEFAULT_SORT,
  filterHerd,
  sortHerd,
  nextSort,
  herdSubtitle,
  hasActiveFilter,
  type SortColumn,
  type HerdFilters,
  type HerdSort,
} from "@/components/herd/filters";

export default function HerdPage() {
  const animals = useHerdStore((state) => state.animals);
  const treatments = useHerdStore((state) => state.treatments);
  const lots = useHerdStore((state) => state.lots);

  const [filters, setFilters] = useState<HerdFilters>(INITIAL_FILTERS);
  const [sort, setSort] = useState<HerdSort>(DEFAULT_SORT);

  const derived = useMemo(
    () => withStatus(activeAnimals(animals), treatments, todayISO()),
    [animals, treatments]
  );

  const lotNames = useMemo(
    () => new Map(lots.map((lot) => [lot.id, lot.name])),
    [lots]
  );

  const filtered = useMemo(() => filterHerd(derived, filters), [derived, filters]);

  const sorted = useMemo(
    () => sortHerd(filtered, sort, lotNames),
    [filtered, sort, lotNames]
  );

  const filterActive = hasActiveFilter(filters);

  const sortBy = (column: SortColumn): void => {
    setSort((current) => nextSort(current, column));
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-6 md:px-8">
      <PageHeader
        title="Rebanho"
        subtitle={herdSubtitle(derived.length, filtered.length, filterActive)}
        actions={
          <div className="flex flex-wrap gap-2">
            <ImportHerdDialog />
            <RegisterAnimalDialog />
          </div>
        }
      />

      <FilterBar filters={filters} lots={lots} onChange={setFilters} />

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-hairline bg-panel">
          <EmptyState
            icon={SearchX}
            title="Nenhum animal encontrado"
            description="Ajuste a busca ou limpe os filtros para voltar a ver o rebanho."
          />
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <HerdTable
              items={sorted}
              lotNames={lotNames}
              sort={sort}
              onSort={sortBy}
            />
          </div>

          <ul className="flex flex-col gap-2 md:hidden">
            {sorted.map((item) => (
              <AnimalCard
                key={item.animal.earTag}
                item={item}
                lotName={lotNames.get(item.animal.lotId) ?? "—"}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
