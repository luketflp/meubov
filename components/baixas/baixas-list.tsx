"use client";

/**
 * Baixas log: every animal that left the herd other than by sale, newest exit
 * first, filterable by motivo. Table on desktop, stacked cards on mobile — the
 * same shape as the births log. The filter is kept in the `motivo` query so the
 * Painel can link straight to the mortes. Whoever may edit the Rebanho can
 * exclude a baixa entered by mistake, which puts the animal back in the herd.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HeartOff, Trash2 } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { formatDate } from "@/lib/domain/dates";
import { INACTIVE_REASON_LABEL, animalCategoryName } from "@/lib/domain/labels";
import type { Animal } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BAIXA_FILTER_ALL,
  BAIXA_FILTER_LABEL,
  parseBaixaFilter,
  recentBaixas,
  type BaixaFilter,
} from "@/components/baixas/baixas";
import { DeleteBaixaDialog } from "@/components/baixas/delete-baixa-dialog";

const linkClass = "font-mono font-medium text-ink underline-offset-2 hover:underline";

const FILTERS = Object.keys(BAIXA_FILTER_LABEL) as BaixaFilter[];

function DeleteButton({ animal, onClick }: { animal: Animal; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`Excluir baixa do animal ${animal.earTag}`}
      className="text-ink-soft hover:text-overdue"
      onClick={onClick}
    >
      <Trash2 aria-hidden />
    </Button>
  );
}

function reasonLabel(animal: Animal): string {
  return animal.inactiveReason ? INACTIVE_REASON_LABEL[animal.inactiveReason] : "—";
}

function dateLabel(animal: Animal): string {
  return animal.inactiveDate ? formatDate(animal.inactiveDate) : "—";
}

export function BaixasList() {
  const animals = useHerdStore((s) => s.animals);
  const lots = useHerdStore((s) => s.lots);
  const customCategories = useHerdStore((s) => s.customCategories);
  const router = useRouter();
  const pathname = usePathname();
  const filter = parseBaixaFilter(useSearchParams().get("motivo"));
  const canEdit = useCan("herd", "edit");
  const [deleting, setDeleting] = useState<Animal | null>(null);

  const baixas = useMemo(() => recentBaixas(animals, filter), [animals, filter]);
  const lotNames = useMemo(() => new Map(lots.map((lot) => [lot.id, lot.name])), [lots]);
  const lotName = (animal: Animal): string => lotNames.get(animal.lotId) ?? "—";

  const setFilter = (next: BaixaFilter): void => {
    router.replace(next === BAIXA_FILTER_ALL ? pathname : `${pathname}?motivo=${next}`, {
      scroll: false,
    });
  };

  return (
    <SectionCard
      title="Baixas registradas"
      action={
        <Select value={filter} onValueChange={(v) => setFilter(v as BaixaFilter)}>
          <SelectTrigger className="min-h-9" aria-label="Filtrar por motivo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {BAIXA_FILTER_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {baixas.length === 0 ? (
        <EmptyState
          icon={HeartOff}
          title="Nenhuma baixa registrada"
          description="As mortes e perdas lançadas na ficha do animal ou no brete aparecem aqui."
        />
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Brinco</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Raça</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Observação</TableHead>
                  {canEdit ? (
                    <TableHead className="w-12">
                      <span className="sr-only">Ações</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {baixas.map((animal) => (
                  <TableRow key={animal.id}>
                    <TableCell className="font-mono text-ink">{dateLabel(animal)}</TableCell>
                    <TableCell>
                      <Link href={`/herd/${animal.id}`} className={linkClass}>
                        {animal.earTag}
                      </Link>
                    </TableCell>
                    <TableCell className="text-ink-soft">
                      {animalCategoryName(animal, customCategories)}
                    </TableCell>
                    <TableCell className="text-ink-soft">{animal.breed}</TableCell>
                    <TableCell className="text-ink-soft">{lotName(animal)}</TableCell>
                    <TableCell className="text-ink">{reasonLabel(animal)}</TableCell>
                    <TableCell className="max-w-64 text-ink-soft">
                      {animal.inactiveNotes ?? "—"}
                    </TableCell>
                    {canEdit ? (
                      <TableCell className="text-right">
                        <DeleteButton animal={animal} onClick={() => setDeleting(animal)} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: stacked cards */}
          <ul className="space-y-3 md:hidden">
            {baixas.map((animal) => (
              <li key={animal.id} className="rounded-lg border border-hairline bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/herd/${animal.id}`} className={linkClass}>
                    {animal.earTag}
                  </Link>
                  <span className="flex items-center gap-1">
                    <span className="font-mono text-xs text-ink-soft">{dateLabel(animal)}</span>
                    {canEdit ? (
                      <DeleteButton animal={animal} onClick={() => setDeleting(animal)} />
                    ) : null}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  <span className="text-ink">{reasonLabel(animal)}</span> ·{" "}
                  {animalCategoryName(animal, customCategories)} · {animal.breed} · lote{" "}
                  {lotName(animal)}
                </p>
                {animal.inactiveNotes ? (
                  <p className="mt-1 text-xs text-ink-soft">{animal.inactiveNotes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
      <DeleteBaixaDialog animal={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </SectionCard>
  );
}
