/**
 * The Relatório técnico on A4: the season, prenhez by bull, the calvings, GMD
 * by lote and sanidade over the period. A section with nothing to show says
 * so in a line instead of drawing an empty table.
 */
import { formatDate } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { GESTATION_DAYS } from "@/lib/domain/reproduction";
import type { ExportContext } from "@/lib/export/table";
import type { TechnicalParams, TechnicalReport } from "@/lib/reports/technical";
import {
  A4Sheet,
  PrintFigures,
  PrintFooter,
  PrintHeader,
  PrintNote,
  PrintSection,
  PrintTable,
  type PrintFarm,
} from "@/components/print/PrintSheet";
import {
  technicalBullsTable,
  technicalLotsTable,
  technicalSanitaryTable,
} from "@/components/reports/tables";

/** "80%", or "—" before the first diagnosis. */
export const rateLabel = (pct: number | null): string => (pct === null ? "—" : `${formatNumber(pct)}%`);

export function TechnicalSheet({
  report,
  params,
  lotName,
  farm,
  context,
}: {
  report: TechnicalReport;
  params: TechnicalParams;
  /** The lote picked, or null for the whole farm. */
  lotName: string | null;
  farm: PrintFarm;
  context: ExportContext;
}) {
  const { season, calvings } = report;
  const bulls = technicalBullsTable(report);
  const lots = technicalLotsTable(report);
  const sanitary = technicalSanitaryTable(report);

  return (
    <A4Sheet>
      <PrintHeader
        farm={farm}
        title="Relatório técnico"
        subtitle={`${formatDate(params.from)} a ${formatDate(params.to)} · ${lotName ? `lote ${lotName}` : "todos os lotes"}`}
      />

      <PrintSection title="Reprodução no período" note="cada matriz pela última cobertura do período">
        {season.exposed > 0 ? (
          <PrintFigures
            figures={[
              { label: "Expostas", value: formatNumber(season.exposed) },
              {
                label: "Diagnosticadas",
                value: formatNumber(season.diagnosed),
                note: season.awaiting > 0 ? `${season.awaiting} aguardando` : undefined,
              },
              {
                label: "Prenhes",
                value: formatNumber(season.pregnant),
                note: season.ratePct === null ? undefined : `${rateLabel(season.ratePct)} das diagnosticadas`,
              },
              { label: "Vazias", value: formatNumber(season.open) },
            ]}
          />
        ) : (
          <PrintNote>Nenhuma cobertura registrada no período.</PrintNote>
        )}
      </PrintSection>

      <PrintSection title="Prenhez por touro">
        {report.byBull.length > 0 ? (
          <PrintTable table={bulls.table} totals={bulls.totals} />
        ) : (
          <PrintNote>Sem coberturas no período.</PrintNote>
        )}
      </PrintSection>

      <PrintSection title="Partos" note="das prenhezes do período">
        {calvings.expected > 0 ? (
          <PrintFigures
            figures={[
              { label: "Previstos", value: formatNumber(calvings.expected) },
              { label: "Nascidos", value: formatNumber(calvings.born) },
              { label: "Próximos 30 dias", value: formatNumber(calvings.next30) },
              {
                label: "Atrasados",
                value: formatNumber(calvings.overdue),
                note: `passaram de ${GESTATION_DAYS} dias`,
              },
            ]}
          />
        ) : (
          <PrintNote>Nenhuma prenhez confirmada no período.</PrintNote>
        )}
      </PrintSection>

      <PrintSection title="Desempenho por lote" note="GMD entre a primeira e a última pesagem do período">
        {report.lots.length > 0 ? (
          <PrintTable table={lots.table} totals={lots.totals} />
        ) : (
          <PrintNote>Nenhum animal pesado duas vezes no período.</PrintNote>
        )}
      </PrintSection>

      <PrintSection title="Sanidade no período">
        {report.sanitary.length > 0 ? (
          <PrintTable table={sanitary.table} />
        ) : (
          <PrintNote>Nenhuma aplicação no período e nenhum animal em carência hoje.</PrintNote>
        )}
      </PrintSection>

      <PrintFooter context={context} />
    </A4Sheet>
  );
}
