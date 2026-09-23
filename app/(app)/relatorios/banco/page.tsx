"use client";

/**
 * Relatório para banco (/relatorios/banco): the herd on a data-base valued by
 * the arroba (weighed animals) or by head (the rest), with the 12-month flow
 * and the lots, for rural credit and guarantees. Needs Financeiro view.
 */
import { useMemo, useState } from "react";
import type { Category } from "@/lib/types";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { DEFAULT_CARCASS_YIELD_PCT } from "@/lib/domain/weights";
import { pluralCategoryLabel } from "@/lib/export/datasets/finance";
import {
  bankFlowSince,
  bankReport,
  lastSalePrice,
  unweighedByCategory,
  type BankParams,
} from "@/lib/reports/bank";
import { REPORT_CATEGORY_ORDER } from "@/lib/reports/declaration";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { usePrintFarm, useExportContext } from "@/components/export/useExportContext";
import { BankSheet, wholeReais, type BankOptions } from "@/components/reports/BankSheet";
import {
  AffixInput,
  DateInput,
  ParamField,
  ParamToggle,
  PreviewMessage,
  ReportScreen,
} from "@/components/reports/ReportScreen";
import { isIsoDate, parseDecimal } from "@/components/reports/params";
import {
  bankInventoryTable,
  bankLotsTable,
  flowTable,
  headsLabel,
  withTotalsRow,
} from "@/components/reports/tables";
import { useDownload } from "@/components/reports/useDownload";
import { useReportData } from "@/components/reports/useReportData";

export default function BankReportPage() {
  return (
    <RequireAccess area="finance" level="view">
      <BankReportScreen />
    </RequireAccess>
  );
}

const decimalText = (n: number): string => formatNumber(n, Number.isInteger(n) ? 0 : 2);

function BankReportScreen() {
  const data = useReportData();
  const farm = usePrintFarm();
  const exportContext = useExportContext();
  const { download, busy } = useDownload();
  const today = todayISO();

  const lastSale = useMemo(() => lastSalePrice(data.manejoSessions), [data.manejoSessions]);

  const [baseInput, setBaseInput] = useState(today);
  // null = the value prefilled from the last priced sale.
  const [priceInput, setPriceInput] = useState<string | null>(null);
  const [yieldInput, setYieldInput] = useState<string | null>(null);
  const [headPriceInput, setHeadPriceInput] = useState<Partial<Record<Category, string>>>({});
  const [options, setOptions] = useState<BankOptions>({ flow: true, lots: true, signature: true });

  const baseDate = isIsoDate(baseInput) ? baseInput : today;
  const priceText = priceInput ?? (lastSale ? formatNumber(lastSale.pricePerArroba, 2) : "");
  const yieldText = yieldInput ?? decimalText(lastSale?.yieldPct ?? DEFAULT_CARCASS_YIELD_PCT);
  const price = parseDecimal(priceText);
  const yieldPct = parseDecimal(yieldText);
  const priceOk = price !== null && price > 0;
  const yieldOk = yieldPct !== null && yieldPct > 0 && yieldPct <= 100;

  const unweighed = useMemo(() => unweighedByCategory(data, baseDate), [data, baseDate]);
  const unweighedCategories = REPORT_CATEGORY_ORDER.filter((category) => (unweighed[category] ?? 0) > 0);

  const headPrice = useMemo(() => {
    const prices: Partial<Record<Category, number>> = {};
    for (const category of REPORT_CATEGORY_ORDER) {
      const value = parseDecimal(headPriceInput[category] ?? "");
      if (value !== null) prices[category] = value;
    }
    return prices;
  }, [headPriceInput]);

  const params = useMemo<BankParams | null>(
    () =>
      price !== null && price > 0 && yieldPct !== null && yieldPct > 0 && yieldPct <= 100
        ? { baseDate, pricePerArroba: price, yieldPct, headPrice }
        : null,
    [baseDate, price, yieldPct, headPrice]
  );
  const report = useMemo(() => (params ? bankReport(data, params) : null), [data, params]);
  const ready = params !== null;

  const context = exportContext();
  const responsible = data.farm.manager.trim() || context.userName || "";

  const downloadSheet = () => {
    if (!report || !params) return;
    const tables = [withTotalsRow(bankInventoryTable(report))];
    if (options.flow) {
      tables.push(withTotalsRow(flowTable(report.flow, bankFlowSince(baseDate), baseDate, "Evolução em 12 meses")));
    }
    if (options.lots) tables.push(withTotalsRow(bankLotsTable(report)));
    void download("banco", "Relatório para banco", tables, "xlsx", [
      `Data-base: ${formatDate(baseDate)}`,
      `Arroba: ${formatCurrency(params.pricePerArroba)}`,
      `Rendimento: ${decimalText(params.yieldPct)}%`,
    ]);
  };

  const setOption = (key: keyof BankOptions) => (checked: boolean) =>
    setOptions((current) => ({ ...current, [key]: checked }));

  return (
    <ReportScreen
      title="Relatório para banco"
      subtitle={
        report
          ? `Valor estimado ${wholeReais(report.totals.valueBrl)} · ${headsLabel(report.totals.heads)} em ${formatDate(baseDate)}`
          : "Informe o preço da arroba para valorizar o rebanho"
      }
      onDownload={downloadSheet}
      downloading={busy !== null}
      ready={ready}
      params={
        <>
          <ParamField label="Data-base" htmlFor="banco-base">
            <DateInput id="banco-base" value={baseInput} max={today} onChange={setBaseInput} />
          </ParamField>
          <ParamField
            label="Preço da arroba"
            htmlFor="banco-arroba"
            hint={
              lastSale
                ? `Última venda da fazenda: ${formatDate(lastSale.date)}, ${formatCurrency(lastSale.pricePerArroba)}/@.`
                : "Nenhuma venda por arroba registrada: informe o preço."
            }
          >
            <AffixInput
              id="banco-arroba"
              value={priceText}
              onChange={setPriceInput}
              prefix="R$"
              suffix="/@"
              placeholder="0,00"
            />
          </ParamField>
          <ParamField
            label="Rendimento de carcaça"
            htmlFor="banco-rendimento"
            hint={yieldOk ? undefined : "Informe um rendimento entre 1 e 100%."}
          >
            <AffixInput id="banco-rendimento" value={yieldText} onChange={setYieldInput} suffix="%" />
          </ParamField>

          {unweighedCategories.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div>
                <p className="text-sm font-medium text-ink">Animais sem pesagem</p>
                <p className="text-xs text-ink-soft">Preço por cabeça, por categoria.</p>
              </div>
              {unweighedCategories.map((category) => (
                <div key={category} className="grid grid-cols-[minmax(0,1fr)_132px] items-center gap-2">
                  <label htmlFor={`banco-cabeca-${category}`} className="text-[13px] text-ink">
                    {pluralCategoryLabel(category)}{" "}
                    <span className="font-mono text-xs text-ink-soft">· {unweighed[category]}</span>
                  </label>
                  <AffixInput
                    id={`banco-cabeca-${category}`}
                    value={headPriceInput[category] ?? ""}
                    onChange={(value) => setHeadPriceInput((current) => ({ ...current, [category]: value }))}
                    prefix="R$"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-0.5 border-t border-hairline pt-3">
            <p className="mb-1 text-sm font-medium text-ink">Incluir</p>
            <ParamToggle id="banco-evolucao" label="Evolução em 12 meses" checked={options.flow} onChange={setOption("flow")} />
            <ParamToggle id="banco-lotes" label="Peso médio por lote" checked={options.lots} onChange={setOption("lots")} />
            <ParamToggle
              id="banco-assinatura"
              label="Linha de assinatura"
              checked={options.signature}
              onChange={setOption("signature")}
            />
          </div>
        </>
      }
    >
      {report && params ? (
        <BankSheet
          report={report}
          params={params}
          options={options}
          lastSale={lastSale}
          farm={farm}
          responsible={responsible}
          context={context}
        />
      ) : (
        <PreviewMessage>
          {priceOk
            ? "Informe um rendimento de carcaça entre 1 e 100% para montar o relatório."
            : "Informe o preço da arroba para montar o relatório."}
        </PreviewMessage>
      )}
    </ReportScreen>
  );
}
