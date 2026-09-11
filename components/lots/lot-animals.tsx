"use client";

/**
 * The active animals of a lote: one line per head with the weight on the
 * scale, the 120-day GMD and the derived status. Ear tags open the ficha.
 * Desktop is a table like the venda record; mobile stacks cards like Rebanho.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Fence, Search } from "lucide-react";
import type { AnimalWithDerived } from "@/lib/store/selectors";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { formatAge, formatDate } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { animalCategoryName } from "@/lib/domain/labels";
import { SEX_LABEL, formatFullWeight } from "@/components/herd/filters";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LotAnimalsCardProps {
  /** Active animals of the lot, already sorted by ear tag. */
  items: AnimalWithDerived[];
}

/** Rows whose ear tag contains the term (case-insensitive); everything when the term is blank. */
function visibleAnimals(items: AnimalWithDerived[], search: string): AnimalWithDerived[] {
  const term = search.trim().toLowerCase();
  if (term === "") return items;
  return items.filter((item) => item.animal.earTag.toLowerCase().includes(term));
}

function adgLabel(adg: number | null): string {
  return adg === null ? "—" : `${formatNumber(adg, 2)} kg/dia`;
}

export function LotAnimalsCard({ items }: LotAnimalsCardProps) {
  const customCategories = useHerdStore((s) => s.customCategories);
  const [search, setSearch] = useState("");
  const visible = useMemo(() => visibleAnimals(items, search), [items, search]);

  return (
    <SectionCard
      title={`Animais (${items.length})`}
      action={
        items.length > 0 ? (
          <div className="relative w-48 sm:w-60">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar brinco"
              aria-label="Buscar animal do lote por brinco"
              className="min-h-11 pl-9 font-mono md:min-h-9"
            />
          </div>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={Fence}
          title="Nenhum animal neste lote"
          description="Os animais que passaram por aqui continuam com o nome do lote na ficha e no histórico de manejo."
        />
      ) : visible.length === 0 ? (
        <p className="py-1 text-xs text-ink-soft">Nenhum brinco corresponde à busca.</p>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brinco</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Raça</TableHead>
                  <TableHead>Sexo</TableHead>
                  <TableHead>Nascimento</TableHead>
                  <TableHead className="text-right">Peso</TableHead>
                  <TableHead className="text-right">GMD</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(({ animal, status, currentWeightKg, adg }) => (
                  <TableRow key={animal.id}>
                    <TableCell>
                      <Link
                        href={`/herd/${animal.id}`}
                        className="font-mono font-medium text-ink underline-offset-2 hover:underline"
                      >
                        {animal.earTag}
                      </Link>
                    </TableCell>
                    <TableCell>{animalCategoryName(animal, customCategories)}</TableCell>
                    <TableCell>{animal.breed}</TableCell>
                    <TableCell>{SEX_LABEL[animal.sex]}</TableCell>
                    <TableCell>
                      {formatDate(animal.birthDate)}{" "}
                      <span className="text-ink-soft">{formatAge(animal.birthDate)}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-ink">
                      {formatFullWeight(currentWeightKg)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-ink">{adgLabel(adg)}</TableCell>
                    <TableCell>
                      <StatusPill status={status} withDot />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: stacked cards, the whole card opens the ficha */}
          <ul className="space-y-3 md:hidden">
            {visible.map(({ animal, status, currentWeightKg, adg }) => (
              <li key={animal.id}>
                <Link
                  href={`/herd/${animal.id}`}
                  aria-label={`Abrir ficha do animal ${animal.earTag}`}
                  className="flex min-h-11 flex-col gap-1.5 rounded-xl border border-hairline bg-panel p-4 transition-colors active:bg-surface"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-lg leading-none font-semibold text-ink">
                      {animal.earTag}
                    </span>
                    <StatusPill status={status} withDot />
                  </div>
                  <p className="text-sm text-ink-soft">
                    {animalCategoryName(animal, customCategories)} · {animal.breed} ·{" "}
                    {formatAge(animal.birthDate)}
                  </p>
                  <p className="font-mono text-sm text-ink">
                    {currentWeightKg === null ? "sem pesagem" : formatFullWeight(currentWeightKg)}
                    {adg !== null ? ` · GMD ${formatNumber(adg, 2)} kg/dia` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
