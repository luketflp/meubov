"use client";

/**
 * Declaração de rebanho (/relatorios/declaracao): the herd on a data-base by
 * sex × age band and by category, with the movimentação since a chosen date,
 * as the state's defesa agropecuária asks for it.
 */
import { useMemo, useState } from "react";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { herdDeclaration } from "@/lib/reports/declaration";
import { usePrintFarm, useExportContext } from "@/components/export/useExportContext";
import { DeclarationSheet } from "@/components/reports/DeclarationSheet";
import { DateInput, ParamField, PreviewMessage, ReportScreen } from "@/components/reports/ReportScreen";
import { isIsoDate, yearStart } from "@/components/reports/params";
import { declarationTables, headsLabel, withTotalsRow } from "@/components/reports/tables";
import { useDownload } from "@/components/reports/useDownload";
import { useReportData } from "@/components/reports/useReportData";

export default function DeclarationPage() {
  const data = useReportData();
  const farm = usePrintFarm();
  const exportContext = useExportContext();
  const { download, busy } = useDownload();
  const today = todayISO();

  const [baseInput, setBaseInput] = useState(today);
  // Until the farmer picks one, the movimentação starts on 1 January of the base year.
  const [sinceInput, setSinceInput] = useState<string | null>(null);

  const baseDate = isIsoDate(baseInput) ? baseInput : today;
  const since = sinceInput !== null && isIsoDate(sinceInput) ? sinceInput : yearStart(baseDate);
  const valid = since < baseDate;

  const declaration = useMemo(
    () => herdDeclaration(data, baseDate, since),
    [data, baseDate, since]
  );

  const context = exportContext();
  const responsible = data.farm.manager.trim() || context.userName || "";
  const filters = [`Data-base: ${formatDate(baseDate)}`, `Movimentação desde: ${formatDate(since)}`];

  const downloadSheet = () => {
    const { bands, categories, flow } = declarationTables(declaration);
    void download(
      "declaracao",
      "Declaração de rebanho",
      [bands, categories, flow].map(withTotalsRow),
      "xlsx",
      filters
    );
  };

  return (
    <ReportScreen
      title="Declaração de rebanho"
      subtitle={`${headsLabel(declaration.flow.end)} em ${formatDate(baseDate)}`}
      onDownload={downloadSheet}
      downloading={busy !== null}
      ready={valid}
      params={
        <>
          <ParamField label="Data-base" htmlFor="declaracao-base" hint="Saldo e idades nesta data.">
            <DateInput id="declaracao-base" value={baseInput} max={today} onChange={setBaseInput} />
          </ParamField>
          <ParamField
            label="Movimentação desde"
            htmlFor="declaracao-since"
            hint={
              valid
                ? "Em geral, a data da última declaração."
                : "A movimentação precisa começar antes da data-base."
            }
          >
            <DateInput
              id="declaracao-since"
              value={sinceInput ?? since}
              max={baseDate}
              onChange={setSinceInput}
            />
          </ParamField>
        </>
      }
    >
      {valid ? (
        <DeclarationSheet
          declaration={declaration}
          farm={farm}
          responsible={responsible}
          context={context}
        />
      ) : (
        <PreviewMessage>Escolha uma data de início da movimentação anterior à data-base.</PreviewMessage>
      )}
    </ReportScreen>
  );
}
