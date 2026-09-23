"use client";

/**
 * The "Planilhas" of Relatórios: one row per list of the farm with its row
 * count, its columns and the .xlsx / .csv buttons. On the phone a row keeps
 * one download button (xlsx) and the list opens after the first five.
 */
import { useState } from "react";
import {
  ArrowDownRight,
  Baby,
  Beef,
  CircleDollarSign,
  ClipboardList,
  Dna,
  Download,
  Fence,
  Scale,
  Syringe,
  TestTubeDiagonal,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/domain/format";
import { cn } from "@/lib/utils";
import { datasetRows, type DatasetKey, type ReportDataset } from "@/components/reports/datasets";
import type { DownloadFormat } from "@/components/reports/useDownload";

const ICON: Record<DatasetKey, LucideIcon> = {
  animals: Beef,
  weighings: Scale,
  treatments: Syringe,
  breedings: Dna,
  births: Baby,
  baixas: ArrowDownRight,
  manejos: ClipboardList,
  lots: Fence,
  semen: TestTubeDiagonal,
  expenses: CircleDollarSign,
};

/** Rows the phone shows before "Ver as N planilhas". */
const PHONE_ROWS = 5;

const rowsLabel = (n: number): string => `${formatNumber(n)} ${n === 1 ? "linha" : "linhas"}`;

/** "brinco, categoria, raça": the columns of every table of the planilha. */
function columnsLabel(dataset: ReportDataset): string {
  return dataset.tables
    .map((table) => table.columns.map((column) => column.header).join(", "))
    .join(" · ");
}

export function SheetsList({
  datasets,
  busy,
  onDownload,
}: {
  datasets: ReportDataset[];
  busy: string | null;
  onDownload: (dataset: ReportDataset, format: DownloadFormat) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = datasets.length > PHONE_ROWS;

  return (
    <section className="rounded-lg border border-hairline bg-panel">
      <ul>
        {datasets.map((dataset, i) => {
          const Icon = ICON[dataset.key];
          const rows = datasetRows(dataset);
          const working = busy === `${dataset.key}.xlsx` || busy === `${dataset.key}.csv`;
          return (
            <li
              key={dataset.key}
              className={cn(
                "items-center gap-3 px-3 py-1.5 md:grid md:grid-cols-[28px_minmax(0,220px)_minmax(0,1fr)_auto] md:gap-3.5 md:px-4 md:py-3",
                i > 0 && "border-t border-hairline",
                !expanded && i >= PHONE_ROWS ? "hidden md:grid" : "flex"
              )}
            >
              <Icon className="size-[18px] shrink-0 text-ink-soft" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
                  {dataset.name}
                  {dataset.finance ? (
                    <Badge variant="secondary" className="font-normal">
                      Financeiro
                    </Badge>
                  ) : null}
                </p>
                <p className="font-mono text-[11px] text-ink-soft md:text-xs">
                  {rowsLabel(rows)}
                  {!dataset.csv ? " · só .xlsx" : ""}
                </p>
              </div>
              <p className="hidden text-xs leading-[17px] text-ink-soft md:line-clamp-2">
                {columnsLabel(dataset)}
              </p>
              <div className="hidden gap-1.5 md:flex">
                <Button
                  variant="ghost"
                  className="text-brand"
                  disabled={busy !== null}
                  onClick={() => onDownload(dataset, "xlsx")}
                  aria-label={`Baixar ${dataset.name} em .xlsx`}
                >
                  <Download aria-hidden />
                  .xlsx
                </Button>
                {dataset.csv ? (
                  <Button
                    variant="ghost"
                    className="text-brand"
                    disabled={busy !== null}
                    onClick={() => onDownload(dataset, "csv")}
                    aria-label={`Baixar ${dataset.name} em .csv`}
                  >
                    .csv
                  </Button>
                ) : (
                  // Keeps the .xlsx buttons in one column when a planilha has no CSV.
                  <Button variant="ghost" className="invisible" aria-hidden tabIndex={-1}>
                    .csv
                  </Button>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon-lg"
                className="size-11 text-brand md:hidden"
                disabled={busy !== null}
                onClick={() => onDownload(dataset, "xlsx")}
                aria-label={`Baixar ${dataset.name} em .xlsx`}
              >
                <Download className={cn("size-[18px]", working && "animate-pulse")} aria-hidden />
              </Button>
            </li>
          );
        })}
        {collapsible && !expanded ? (
          <li className="border-t border-hairline md:hidden">
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-center text-sm font-medium text-brand"
              onClick={() => setExpanded(true)}
            >
              Ver as {datasets.length} planilhas
            </button>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
