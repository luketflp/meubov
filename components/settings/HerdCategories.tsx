"use client";

import { SectionCard } from "@/components/ui/section-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { activeAnimals, countByCategory } from "@/lib/store/selectors";
import { formatNumber } from "@/lib/domain/format";
import type { Category } from "@/lib/types";

interface CategoryRow {
  category: Category;
  label: string;
  description: string;
  sex: string;
}

const ROWS: readonly CategoryRow[] = [
  { category: "calf", label: "Bezerro(a)", description: "Até 12 meses", sex: "Macho ou fêmea" },
  { category: "heifer", label: "Novilha", description: "12–36 meses, sem cria", sex: "Fêmea" },
  { category: "steer", label: "Boi", description: "Acima de 12 meses", sex: "Macho" },
  { category: "cow", label: "Vaca", description: "Adulta", sex: "Fêmea" },
  { category: "bull", label: "Touro", description: "Reprodutor", sex: "Macho" },
];

/** Informative table of the herd categories with a live count of active animals. */
export function HerdCategories() {
  const animals = useHerdStore((s) => s.animals);
  const count = countByCategory(activeAnimals(animals));

  return (
    <SectionCard title="Categorias do rebanho">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Categoria</TableHead>
            <TableHead>Descrição / faixa etária</TableHead>
            <TableHead>Sexo</TableHead>
            <TableHead className="text-right">Cabeças</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ROWS.map(({ category, label, description, sex }) => (
            <TableRow key={category}>
              <TableCell className="font-medium">{label}</TableCell>
              <TableCell className="text-ink-soft">{description}</TableCell>
              <TableCell className="text-ink-soft">{sex}</TableCell>
              <TableCell className="text-right font-mono">
                {formatNumber(count[category])}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}
