/**
 * The Relatório para banco on A4: the herd's figures, the inventory valued by
 * category, and optionally the 12-month flow, the lots and the signatures,
 * with a note on how the value was reached.
 */
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import type { ExportContext } from "@/lib/export/table";
import { bankFlowSince, type BankParams, type BankReport } from "@/lib/reports/bank";
import {
  A4Sheet,
  PrintFigures,
  PrintFooter,
  PrintHeader,
  PrintNote,
  PrintSection,
  PrintSignatures,
  PrintTable,
  type PrintFarm,
} from "@/components/print/PrintSheet";
import { bankInventoryTable, bankLotsTable, flowTable } from "@/components/reports/tables";
import { cn } from "@/lib/utils";

/** The optional sections of the report. */
export interface BankOptions {
  flow: boolean;
  lots: boolean;
  signature: boolean;
}

const percent = (n: number): string => `${formatNumber(n, Number.isInteger(n) ? 0 : 1)}%`;

/** Whole reais: "R$ 1.619.939". */
export const wholeReais = (n: number): string => `R$ ${formatNumber(n, 0)}`;

export function BankSheet({
  report,
  params,
  options,
  lastSale,
  farm,
  responsible,
  context,
}: {
  report: BankReport;
  params: BankParams;
  options: BankOptions;
  lastSale: { date: string; pricePerArroba: number } | null;
  farm: PrintFarm;
  responsible: string;
  context: ExportContext;
}) {
  const { totals } = report;
  const inventory = bankInventoryTable(report);
  const flow = flowTable(report.flow, bankFlowSince(params.baseDate), params.baseDate, "Evolução em 12 meses");
  const lots = bankLotsTable(report);
  const price = formatCurrency(params.pricePerArroba);
  const unpriced = report.rows.some((row) => row.unweighed > 0 && row.headPrice === null);

  return (
    <A4Sheet>
      <PrintHeader
        farm={farm}
        title="Relatório patrimonial do rebanho"
        subtitle={`Data-base ${formatDate(params.baseDate)} · ${price}/@ · rendimento ${percent(params.yieldPct)}`}
      />
      <PrintFigures
        figures={[
          { label: "Cabeças", value: formatNumber(totals.heads) },
          { label: "Peso vivo pesado", value: `${formatNumber(totals.liveKg)} kg` },
          { label: "Arrobas de carcaça", value: formatNumber(totals.arrobas) },
          { label: "Valor estimado", value: wholeReais(totals.valueBrl) },
        ]}
      />
      <PrintSection title="Inventário valorizado" note="por categoria">
        {report.rows.length > 0 ? (
          <PrintTable table={inventory.table} totals={inventory.totals} />
        ) : (
          <PrintNote>Nenhum animal no rebanho na data-base.</PrintNote>
        )}
      </PrintSection>
      {options.flow || options.lots ? (
        <div
          className={cn(
            "grid gap-5",
            options.flow && options.lots && "grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]"
          )}
        >
          {options.flow ? (
            <PrintSection title="Evolução em 12 meses">
              <PrintTable table={flow.table} totals={flow.totals} />
            </PrintSection>
          ) : null}
          {options.lots ? (
            <PrintSection title="Peso médio por lote">
              {report.lots.length > 0 ? (
                <PrintTable table={lots.table} />
              ) : (
                <PrintNote>Nenhum lote com animais na data-base.</PrintNote>
              )}
            </PrintSection>
          ) : null}
        </div>
      ) : null}
      <PrintNote>
        Categorias como estão hoje no cadastro. Método: animais pesados valem o último peso até a data-base × {percent(params.yieldPct)} ÷ 15 ×{" "}
        {price}. Animais sem pesagem valem o preço por cabeça informado para a categoria
        {unpriced ? "; sem preço informado, entram com valor zero" : ""}. Preço da arroba informado
        pelo produtor
        {lastSale
          ? `; última venda da fazenda em ${formatDate(lastSale.date)} a ${formatCurrency(lastSale.pricePerArroba)}/@`
          : ""}
        .
      </PrintNote>
      {/* One bottom block, so the signatures sit right above the footer. */}
      <div className="mt-auto flex flex-col gap-5">
        {options.signature ? (
          <PrintSignatures
            labels={["Local e data", responsible ? `${responsible} · produtor` : "Produtor responsável"]}
          />
        ) : null}
        <PrintFooter context={context} />
      </div>
    </A4Sheet>
  );
}
