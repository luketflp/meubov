import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Layers } from "lucide-react";
import type { LotEconomics } from "@/lib/domain/lotEconomics";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { formatCompactCurrency } from "@/components/finance/format";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const DASH = "—";
const COLUMNS = [
  "Cab.",
  "Custo direto",
  "Rateio",
  "Custo total",
  "R$/cab/dia",
  "GMD",
  "@ produzidas",
  "Custo/@",
  "Margem/@",
];

const money = (value: number | null) => (value === null ? DASH : formatCurrency(value));
const number = (value: number | null, decimals = 0) =>
  value === null ? DASH : formatNumber(value, decimals);

function Margin({ value }: { value: number | null }) {
  if (value === null) return <>{DASH}</>;
  return (
    <span className={cn("font-medium", value >= 0 ? "text-healthy" : "text-overdue")}>
      {value >= 0 ? "+" : "−"}
      {formatNumber(Math.abs(value))}
    </span>
  );
}

/** The nine figure cells of a row, in COLUMNS order. */
function figures(row: LotEconomics): ReactNode[] {
  return [
    formatNumber(row.heads),
    money(row.directBrl),
    <span key="shared" className="text-ink-soft">
      {money(row.sharedBrl)}
    </span>,
    money(row.totalBrl),
    number(row.perHeadDay, 2),
    row.adg === null ? DASH : `${formatNumber(row.adg, 2)} kg`,
    number(row.produced),
    money(row.costPerArroba),
    <Margin key="margin" value={row.marginPerArroba} />,
  ];
}

interface LotsEconomicsCardProps {
  lots: LotEconomics[];
  farm: LotEconomics;
  /** Today's arroba price, or null when unavailable. */
  quote: number | null;
}

/** "Por lote": each lote as a centro de custo, with the farm's totals under it. */
export function LotsEconomicsCard({ lots, farm, quote }: LotsEconomicsCardProps) {
  return (
    <SectionCard
      title="Por lote"
      subtitle="custo direto + rateio por cabeça · lote como centro de custo"
      action={
        <Link
          href="/lots"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver lotes
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      {lots.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Nenhum lote ativo"
          description="Crie lotes e lance custos neles para ver o custo por lote."
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] tracking-wide text-ink-soft uppercase">Lote</TableHead>
                  {COLUMNS.map((column) => (
                    <TableHead
                      key={column}
                      className="text-right text-[11px] tracking-wide text-ink-soft uppercase"
                    >
                      {column}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.map((row) => (
                  <TableRow key={row.lotId ?? row.name}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-ink">{row.name}</span>
                        <span className="text-xs text-ink-soft">{formatNumber(row.heads)} cab</span>
                      </div>
                    </TableCell>
                    {figures(row).map((cell, index) => (
                      <TableCell key={COLUMNS[index]} className="text-right font-mono whitespace-nowrap">
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Fazenda</TableCell>
                  {figures(farm).map((cell, index) => (
                    <TableCell
                      key={COLUMNS[index]}
                      className="text-right font-mono font-semibold whitespace-nowrap"
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          <ul className="-mt-1 md:hidden">
            {lots.map((row, index) => (
              <li
                key={row.lotId ?? row.name}
                className={cn("py-3", index > 0 && "border-t border-hairline")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-ink">{row.name}</span>
                  <span className="shrink-0 text-xs text-ink-soft">{formatNumber(row.heads)} cab</span>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2">
                  <div>
                    <dt className="text-[11px] text-ink-soft">Custo</dt>
                    <dd className="mt-0.5 font-mono text-sm text-ink">
                      {formatCompactCurrency(row.totalBrl)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-ink-soft">R$/cab/dia</dt>
                    <dd className="mt-0.5 font-mono text-sm text-ink">{number(row.perHeadDay, 2)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-ink-soft">Custo/@</dt>
                    <dd className="mt-0.5 font-mono text-sm text-ink">{money(row.costPerArroba)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs text-ink-soft">
            Rateio: despesas sem lote divididas por cabeça. Margem/@ na cotação de hoje (
            {quote === null ? DASH : formatCurrency(quote)}).
          </p>
        </>
      )}
    </SectionCard>
  );
}
