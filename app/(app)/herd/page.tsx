"use client";

import { Suspense, useEffect, useMemo } from "react";
import { SearchX } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { activeAnimals, withStatus } from "@/lib/store/selectors";
import { todayISO } from "@/lib/domain/dates";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/herd/FilterBar";
import { HerdTable } from "@/components/herd/HerdTable";
import { HerdPagination } from "@/components/herd/HerdPagination";
import { AnimalCard } from "@/components/herd/AnimalCard";
import { AddAnimalsButton } from "@/components/herd/AddAnimalsButton";
import { ImportHerdDialog } from "@/components/herd/ImportHerdDialog";
import { useHerdView } from "@/components/herd/useHerdView";
import { paginate } from "@/components/herd/pagination";
import {
  LOT_ALL,
  filterHerd,
  sortHerd,
  herdSubtitle,
  hasActiveFilter,
} from "@/components/herd/filters";

// The view lives in the URL query, which useSearchParams reads inside a Suspense boundary.
export default function HerdPage() {
  return (
    <Suspense fallback={null}>
      <HerdScreen />
    </Suspense>
  );
}

function HerdScreen() {
  const animals = useHerdStore((state) => state.animals);
  const treatments = useHerdStore((state) => state.treatments);
  const lots = useHerdStore((state) => state.lots);
  const invernadas = useHerdStore((state) => state.invernadas);
  const lotPlacements = useHerdStore((state) => state.lotPlacements);
  const canEdit = useCan("herd", "edit");
  const canEditLots = useCan("lots", "edit");

  const { view, searchText, setFilters, sortBy, goToPage, setPageSize, replaceView } =
    useHerdView();

  const derived = useMemo(
    () => withStatus(activeAnimals(animals), treatments, todayISO()),
    [animals, treatments]
  );

  const lotNames = useMemo(
    () => new Map(lots.map((lot) => [lot.id, lot.name])),
    [lots]
  );

  const invernadaNames = useMemo(() => {
    const byId = new Map(invernadas.map((invernada) => [invernada.id, invernada]));
    return new Map(
      lotPlacements
        .filter((placement) => placement.endedOn === undefined)
        .map((placement) => {
          const invernada = byId.get(placement.invernadaId);
          return [
            placement.lotId,
            invernada
              ? `${invernada.code}${invernada.name ? ` · ${invernada.name}` : ""}`
              : "—",
          ] as const;
        })
    );
  }, [invernadas, lotPlacements]);

  // A link to a lot that no longer exists shows the whole herd.
  const lotId = lotNames.has(view.filters.lotId) ? view.filters.lotId : LOT_ALL;
  const filters = useMemo(() => ({ ...view.filters, lotId }), [view.filters, lotId]);

  const filtered = useMemo(() => filterHerd(derived, filters), [derived, filters]);

  const sorted = useMemo(
    () => sortHerd(filtered, view.sort, lotNames),
    [filtered, view.sort, lotNames]
  );

  const current = useMemo(
    () => paginate(sorted, view.page, view.pageSize),
    [sorted, view.page, view.pageSize]
  );

  // A stale link (that lot, or a page past the end) is rewritten to the view on screen.
  useEffect(() => {
    if (current.page === view.page && lotId === view.filters.lotId) return;
    replaceView({ ...view, filters, page: current.page });
  }, [current.page, lotId, view, filters, replaceView]);

  const filterActive = hasActiveFilter(filters);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-6 md:px-8">
      <PageHeader
        title="Rebanho"
        subtitle={herdSubtitle(derived.length, filtered.length, filterActive)}
        badges={canEdit ? undefined : <ReadOnlyPill />}
        actions={
          canEdit ? (
            <div className="flex flex-wrap gap-2">
              {/* The import creates the sheet's new lots, so the server also asks for Lotes edit. */}
              {canEditLots ? <ImportHerdDialog /> : null}
              <AddAnimalsButton />
            </div>
          ) : undefined
        }
      />

      <FilterBar filters={{ ...filters, search: searchText }} lots={lots} onChange={setFilters} />

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
              items={current.items}
              lotNames={lotNames}
              invernadaNames={invernadaNames}
              sort={view.sort}
              onSort={sortBy}
            />
          </div>

          <ul className="flex flex-col gap-2 md:hidden">
            {current.items.map((item) => (
              <AnimalCard
                key={item.animal.id}
                item={item}
                lotName={lotNames.get(item.animal.lotId) ?? "—"}
                invernadaName={invernadaNames.get(item.animal.lotId) ?? "—"}
              />
            ))}
          </ul>

          <HerdPagination
            page={current}
            pageSize={view.pageSize}
            onPageChange={goToPage}
            onPageSizeChange={setPageSize}
          />
        </>
      )}
    </div>
  );
}
