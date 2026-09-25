import type { Indicators } from "@/lib/domain/economics";
import type { LotEconomics } from "@/lib/domain/lotEconomics";
import type { Period } from "@/lib/domain/period";
import { formatDate } from "@/lib/domain/dates";
import { indicatorsExportTable, lotsEconomicsExportTable } from "@/lib/export/datasets/finance";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { PeriodPicker } from "@/components/dashboard/PeriodPicker";
import { ExportMenu } from "@/components/export/ExportMenu";
import { LancarButton } from "@/components/finance/LancarButton";

interface FinanceHeaderProps {
  period: Period;
  onPeriodChange: (period: Period) => void;
  canEdit: boolean;
  ind: Indicators;
  prior: Indicators;
  lots: LotEconomics[];
  farm: LotEconomics;
}

/** Title, the window, "Exportar" (desktop) and "Lançar" (Financeiro edit only). */
export function FinanceHeader({
  period,
  onPeriodChange,
  canEdit,
  ind,
  prior,
  lots,
  farm,
}: FinanceHeaderProps) {
  return (
    <PageHeader
      title="Financeiro"
      subtitle="Indicadores da pecuária de corte"
      badges={canEdit ? undefined : <ReadOnlyPill />}
      actions={
        // One row on the phone: the picker takes the room the small "Lançar" leaves, its date
        // fields without the calendar icon (a tap opens the native picker). `md:contents` hands
        // the children back to the header on desktop.
        <div className="flex w-full items-center justify-between gap-2 md:contents max-md:[&>div:first-child]:min-w-0 max-md:[&>div:first-child]:flex-1 max-md:[&_input]:w-0 max-md:[&_input]:flex-1 max-md:[&_input]:px-0.5 max-md:[&_input::-webkit-calendar-picker-indicator]:hidden">
          <PeriodPicker value={period} onChange={onPeriodChange} />
          <ExportMenu
            title="Financeiro"
            formats={["xlsx", "print"]}
            className="hidden md:inline-flex"
            current={{
              label: "Financeiro",
              detail: `de ${formatDate(period.start)} até ${formatDate(period.end)}`,
              build: () => [indicatorsExportTable(ind, prior), lotsEconomicsExportTable(lots, farm)],
            }}
            hint="Duas tabelas: os indicadores do período contra o ano anterior e o custo por lote."
          />
          <LancarButton className="max-md:gap-1 max-md:px-2 max-md:text-[0.8rem]" />
        </div>
      }
    />
  );
}
