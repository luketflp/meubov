"use client";

/**
 * Relatório técnico (/relatorios/tecnico): the season, prenhez by bull, the
 * calvings, GMD by lote and sanidade over a period, for the whole farm or one
 * lote, for the vet or the consultor.
 */
import { useMemo, useState } from "react";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { technicalReport, type TechnicalParams } from "@/lib/reports/technical";
import { activeLots } from "@/lib/store/selectors";
import { usePrintFarm, useExportContext } from "@/components/export/useExportContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TechnicalSheet, rateLabel } from "@/components/reports/TechnicalSheet";
import { DateInput, ParamField, PreviewMessage, ReportScreen } from "@/components/reports/ReportScreen";
import { defaultPeriod, isIsoDate } from "@/components/reports/params";
import {
  technicalBullsTable,
  technicalLotsTable,
  technicalSanitaryTable,
  technicalSummaryTable,
  withTotalsRow,
} from "@/components/reports/tables";
import { useDownload } from "@/components/reports/useDownload";
import { useReportData } from "@/components/reports/useReportData";

/** Select value for the whole farm. */
const ALL_LOTS = "todos";

export default function TechnicalReportPage() {
  const data = useReportData();
  const farm = usePrintFarm();
  const exportContext = useExportContext();
  const { download, busy } = useDownload();
  const today = todayISO();

  const [fromInput, setFromInput] = useState(() => defaultPeriod(today).from);
  const [toInput, setToInput] = useState(today);
  const [lotChoice, setLotChoice] = useState(ALL_LOTS);

  const lots = useMemo(
    () => activeLots(data.lots).sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true })),
    [data.lots]
  );
  const lot = lots.find((item) => item.id === lotChoice) ?? null;

  const to = isIsoDate(toInput) ? toInput : today;
  const from = isIsoDate(fromInput) ? fromInput : defaultPeriod(to).from;
  const valid = from <= to;

  const params = useMemo<TechnicalParams>(() => ({ from, to, lotId: lot?.id ?? null }), [from, to, lot]);
  const report = useMemo(() => technicalReport(data, params, today), [data, params, today]);

  const context = exportContext();

  const downloadSheet = () =>
    void download(
      "tecnico",
      "Relatório técnico",
      [
        technicalSummaryTable(report),
        withTotalsRow(technicalBullsTable(report)),
        withTotalsRow(technicalLotsTable(report)),
        withTotalsRow(technicalSanitaryTable(report)),
      ],
      "xlsx",
      [`Período: ${formatDate(from)} a ${formatDate(to)}`, `Lote: ${lot ? lot.name : "todos"}`]
    );

  const { season } = report;

  return (
    <ReportScreen
      title="Relatório técnico"
      subtitle={
        season.exposed > 0
          ? `${season.exposed} ${season.exposed === 1 ? "matriz exposta" : "matrizes expostas"} · prenhez ${rateLabel(season.ratePct)}`
          : `${formatDate(from)} a ${formatDate(to)}`
      }
      onDownload={downloadSheet}
      downloading={busy !== null}
      ready={valid}
      params={
        <>
          <ParamField label="De" htmlFor="tecnico-de">
            <DateInput id="tecnico-de" value={fromInput} max={to} onChange={setFromInput} />
          </ParamField>
          <ParamField
            label="Até"
            htmlFor="tecnico-ate"
            hint={valid ? "Coberturas, pesagens e aplicações dentro do período." : "O início precisa vir antes do fim."}
          >
            <DateInput id="tecnico-ate" value={toInput} max={today} onChange={setToInput} />
          </ParamField>
          <ParamField
            label="Lote"
            htmlFor="tecnico-lote"
            hint="Pelo lote em que cada animal está hoje."
          >
            <Select value={lot ? lot.id : ALL_LOTS} onValueChange={setLotChoice}>
              <SelectTrigger id="tecnico-lote" className="min-h-11 w-full md:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_LOTS}>Todos os lotes</SelectItem>
                {lots.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ParamField>
        </>
      }
    >
      {valid ? (
        <TechnicalSheet
          report={report}
          params={params}
          lotName={lot?.name ?? null}
          farm={farm}
          context={context}
        />
      ) : (
        <PreviewMessage>Escolha um período com início antes do fim.</PreviewMessage>
      )}
    </ReportScreen>
  );
}
