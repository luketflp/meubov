import { CircleDollarSign } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Animal, Category } from "@/lib/types";
import { herdValue } from "@/lib/domain/finance";
import { formatArroba, formatCurrency, formatNumber } from "@/lib/domain/format";
import { kgToArroba, totalWeightKg } from "@/lib/domain/weights";
import { pluralCategory } from "@/lib/domain/labels";

interface CategorySalesTableProps {
  animals: Animal[];
  /** Live arroba price, or null when the quote is unavailable. */
  arrobaPrice: number | null;
}

/** Capitalized plural label of the category, e.g.: "Bezerros". */
function pluralCategoryLabel(category: Category): string {
  const plural = pluralCategory(category, 2);
  return plural.charAt(0).toUpperCase() + plural.slice(1);
}

const CATEGORY_ORDER: Category[] = ["steer", "cow", "heifer", "calf", "bull"];

interface CategoryRow {
  category: Category;
  headCount: number;
  averageArrobas: number;
  totalArrobas: number;
  estimatedValue: number;
}

/** Derives one row per category present among the received active animals. */
function buildRows(animals: Animal[], arrobaPrice: number): CategoryRow[] {
  return CATEGORY_ORDER.map((category) => {
    const inGroup = animals.filter((animal) => animal.category === category);
    const headCount = inGroup.length;
    const totalArrobas = kgToArroba(totalWeightKg(inGroup));
    return {
      category,
      headCount,
      averageArrobas: headCount === 0 ? 0 : totalArrobas / headCount,
      totalArrobas,
      estimatedValue: herdValue(totalArrobas, arrobaPrice),
    };
  }).filter((row) => row.headCount > 0);
}

/** Sums the rows into a grand total (average @ weighted by head count). */
function totalize(rows: CategoryRow[]): Omit<CategoryRow, "category"> {
  const headCount = rows.reduce((sum, row) => sum + row.headCount, 0);
  const totalArrobas = rows.reduce((sum, row) => sum + row.totalArrobas, 0);
  return {
    headCount,
    averageArrobas: headCount === 0 ? 0 : totalArrobas / headCount,
    totalArrobas,
    estimatedValue: rows.reduce((sum, row) => sum + row.estimatedValue, 0),
  };
}

/** Estimated revenue per category at the current arroba price (table + cards on mobile). */
export function CategorySalesTable({ animals, arrobaPrice }: CategorySalesTableProps) {
  if (arrobaPrice === null) {
    return (
      <SectionCard title="Vendas e faturamento estimado por categoria">
        <EmptyState
          icon={CircleDollarSign}
          title="Cotação indisponível"
          description="Sem a cotação da arroba não é possível estimar o faturamento por categoria."
        />
      </SectionCard>
    );
  }

  const rows = buildRows(animals, arrobaPrice);
  const total = totalize(rows);

  if (rows.length === 0) {
    return (
      <SectionCard title="Vendas e faturamento estimado por categoria">
        <EmptyState
          icon={CircleDollarSign}
          title="Sem animais ativos"
          description="Cadastre animais no rebanho para estimar o faturamento por categoria."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Vendas e faturamento estimado por categoria">
      {/* Table (desktop) */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Cabeças</TableHead>
              <TableHead className="text-right">@ média/cab.</TableHead>
              <TableHead className="text-right">@ total</TableHead>
              <TableHead className="text-right">Valor estimado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.category}>
                <TableCell className="font-medium">
                  {pluralCategoryLabel(row.category)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatNumber(row.headCount)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatArroba(row.averageArrobas)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatArroba(row.totalArrobas)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(row.estimatedValue)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell className="text-right font-mono font-semibold">
                {formatNumber(total.headCount)}
              </TableCell>
              <TableCell className="text-right font-mono font-semibold">
                {formatArroba(total.averageArrobas)}
              </TableCell>
              <TableCell className="text-right font-mono font-semibold">
                {formatArroba(total.totalArrobas)}
              </TableCell>
              <TableCell className="text-right font-mono font-semibold">
                {formatCurrency(total.estimatedValue)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {/* Stacked cards (mobile) */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li
            key={row.category}
            className="rounded-lg border border-hairline bg-surface p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">
                {pluralCategoryLabel(row.category)}
              </p>
              <span className="font-mono text-xs text-ink-soft">
                {formatNumber(row.headCount)} cab.
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-ink-soft">@ média/cab.</dt>
                <dd className="mt-0.5 font-mono text-ink">
                  {formatArroba(row.averageArrobas)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-soft">@ total</dt>
                <dd className="mt-0.5 font-mono text-ink">
                  {formatArroba(row.totalArrobas)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-soft">Valor estimado</dt>
                <dd className="mt-0.5 font-mono text-ink">
                  {formatCurrency(row.estimatedValue)}
                </dd>
              </div>
            </dl>
          </li>
        ))}
        <li className="flex min-h-11 items-center justify-between gap-2 rounded-lg bg-brand-soft px-3 py-2.5">
          <p className="text-sm font-semibold text-ink">
            Total · <span className="font-mono">{formatNumber(total.headCount)}</span> cab. ·{" "}
            <span className="font-mono">{formatArroba(total.totalArrobas)}</span>
          </p>
          <span className="font-mono text-sm font-semibold text-ink">
            {formatCurrency(total.estimatedValue)}
          </span>
        </li>
      </ul>
    </SectionCard>
  );
}
