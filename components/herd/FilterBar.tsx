"use client";

import { Search, X } from "lucide-react";
import type { Lot } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORIES,
  INITIAL_FILTERS,
  LOT_ALL,
  CATEGORY_LABELS,
  STATUS_LABELS,
  ANIMAL_STATUSES,
  hasActiveFilter,
  type CategoryFilter,
  type StatusFilter,
  type HerdFilters,
} from "@/components/herd/filters";

interface FilterBarProps {
  filters: HerdFilters;
  lots: Lot[];
  onChange: (filters: HerdFilters) => void;
}

const TRIGGER_CLASS = "min-h-11 shrink-0 bg-panel md:min-h-0";

export function FilterBar({ filters, lots, onChange }: FilterBarProps) {
  const change = <K extends keyof HerdFilters>(key: K, value: HerdFilters[K]): void => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="z-20 md:sticky md:top-0 md:-mx-1 md:bg-canvas/90 md:px-1 md:py-2 md:backdrop-blur-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative md:w-64">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-soft"
          />
          <Input
            value={filters.search}
            onChange={(event) => change("search", event.target.value)}
            placeholder="Buscar por brinco ou raça"
            aria-label="Buscar por brinco ou raça"
            className="h-11 bg-panel pl-8 md:h-8"
          />
        </div>

        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:overflow-visible md:px-0 md:pb-0">
          <Select
            value={filters.category}
            onValueChange={(value) => change("category", value as CategoryFilter)}
          >
            <SelectTrigger aria-label="Filtrar por categoria" className={TRIGGER_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.lotId}
            onValueChange={(value) => change("lotId", value)}
          >
            <SelectTrigger aria-label="Filtrar por lote" className={TRIGGER_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LOT_ALL}>Todos os lotes</SelectItem>
              {lots.map((lot) => (
                <SelectItem key={lot.id} value={lot.id}>
                  {lot.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.status}
            onValueChange={(value) => change("status", value as StatusFilter)}
          >
            <SelectTrigger aria-label="Filtrar por status" className={TRIGGER_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {ANIMAL_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilter(filters) ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange({ ...INITIAL_FILTERS })}
              className="min-h-11 shrink-0 text-ink-soft md:min-h-0"
            >
              <X aria-hidden />
              Limpar filtros
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
