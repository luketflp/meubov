"use client";

/**
 * Resumo do lote: the numbers of a logical group as the farmer reads them at
 * the gate — herd and weight, per-head averages, where the lot stands and how
 * loaded the pasture is, and what the health calendar owes it. Mirrors the
 * venda's SaleSummaryCard: one SectionCard, dl columns, mono values.
 */
import type { ReactNode } from "react";
import type { Invernada } from "@/lib/types";
import type { LotSummary } from "@/lib/store/selectors";
import { formatDate, formatMonths } from "@/lib/domain/dates";
import { formatArroba, formatKg, formatNumber } from "@/lib/domain/format";
import { TREATMENT_TYPE_LABEL } from "@/lib/domain/labels";
import { summaryByCategory } from "@/components/dashboard/helpers";
import { SectionCard } from "@/components/ui/section-card";
import { StatusDot } from "@/components/ui/status-dot";
import { StatusPill } from "@/components/ui/status-pill";
import { SummaryRow } from "@/components/ui/summary-row";

const NONE = "—";
/** Past placements listed inline; the Mover dialog shows the whole history. */
const PREVIOUS_SHOWN = 3;

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">{children}</p>;
}

function invernadaLabel(invernada: Invernada | null): string {
  if (!invernada) return "Invernada não encontrada";
  return `${invernada.code}${invernada.name ? ` · ${invernada.name}` : ""}`;
}

function Count({
  status,
  value,
}: {
  status: "healthy" | "attention" | "overdue";
  value: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusDot status={status} />
      {value}
    </span>
  );
}

export function LotSummaryCard({ summary }: { summary: LotSummary }) {
  const { heads, stocking, currentInvernada, currentPlacement, nextActivity } = summary;
  const intro =
    heads === 0
      ? "Nenhum animal ativo"
      : `${heads} ${heads === 1 ? "cabeça" : "cabeças"} · ${summaryByCategory(summary.byCategory)}`;
  // A closed lot has no current row: every placement is history, newest first.
  const previous = summary.placements.filter((row) => row.placement.endedOn != null);
  const newest = summary.placements[0];

  return (
    <SectionCard title="Resumo do lote">
      <p className="mb-3 text-sm text-ink-soft">{intro}</p>

      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        <dl className="space-y-1.5">
          <Eyebrow>Rebanho</Eyebrow>
          <SummaryRow label="Cabeças" value={heads} />
          <SummaryRow label="Pesadas" value={`${summary.weighedHeads} de ${heads}`} />
          <SummaryRow label="Peso total" value={formatKg(summary.totalWeightKg)} />
          <SummaryRow label="@ totais" value={formatArroba(summary.totalArrobas)} />
          <SummaryRow label="UA totais" value={`${formatNumber(summary.totalAu, 1)} UA`} />
          <SummaryRow
            label="Última pesagem"
            value={summary.lastWeighingDate ? formatDate(summary.lastWeighingDate) : NONE}
          />
        </dl>

        <dl className="space-y-1.5">
          <Eyebrow>Média por cabeça</Eyebrow>
          <SummaryRow
            label="Peso vivo"
            value={summary.avgWeightKg === null ? NONE : formatKg(summary.avgWeightKg)}
          />
          <SummaryRow
            label="@ viva (÷30)"
            value={summary.avgLiveArrobas === null ? NONE : formatArroba(summary.avgLiveArrobas)}
          />
          <SummaryRow
            label="Idade"
            value={summary.avgAgeMonths === null ? NONE : formatMonths(summary.avgAgeMonths)}
          />
          <SummaryRow
            label="GMD (120 dias)"
            value={summary.adg === null ? NONE : `${formatNumber(summary.adg, 2)} kg/dia`}
          />
          <SummaryRow label="Com GMD" value={`${summary.adgHeads} de ${heads}`} />
        </dl>

        <dl className="space-y-1.5">
          <Eyebrow>Invernada</Eyebrow>
          <SummaryRow
            label="Atual"
            value={currentPlacement ? invernadaLabel(currentInvernada) : NONE}
          />
          {currentPlacement ? (
            <SummaryRow
              label="Desde"
              value={formatDate(currentPlacement.startedOn)}
              suffix={
                summary.daysInInvernada === null
                  ? undefined
                  : `· ${summary.daysInInvernada} ${summary.daysInInvernada === 1 ? "dia" : "dias"}`
              }
            />
          ) : (
            <SummaryRow
              label="Encerrado em"
              value={newest?.placement.endedOn ? formatDate(newest.placement.endedOn) : NONE}
            />
          )}
          {currentInvernada ? (
            <SummaryRow
              label="Área"
              value={`${formatNumber(currentInvernada.hectares)} ha`}
              suffix={currentInvernada.grass}
            />
          ) : null}
          {stocking ? (
            <SummaryRow
              label="Lotação"
              value={
                <span className="inline-flex flex-wrap items-center justify-end gap-2">
                  {`${formatNumber(stocking.auPerHa, 2)} UA/ha`}
                  <StatusPill status={stocking.classification} />
                </span>
              }
              suffix={
                stocking.otherLots.length === 0
                  ? undefined
                  : `· com ${stocking.otherLots.map((lot) => lot.name).join(", ")}`
              }
            />
          ) : null}
          {previous.length > 0 ? (
            <div className="mt-1.5 space-y-1.5 border-t border-hairline pt-2">
              <p className="text-xs text-ink-soft">Antes</p>
              {previous.slice(0, PREVIOUS_SHOWN).map((row) => (
                <div key={row.placement.id} className="flex items-baseline justify-between gap-3">
                  <dt className="font-mono text-sm text-ink">{invernadaLabel(row.invernada)}</dt>
                  <dd className="text-xs text-ink-soft">
                    {formatDate(row.placement.startedOn)} a{" "}
                    {formatDate(row.placement.endedOn as string)}
                  </dd>
                </div>
              ))}
              {previous.length > PREVIOUS_SHOWN ? (
                <p className="text-xs text-ink-soft">
                  +{previous.length - PREVIOUS_SHOWN} anteriores no histórico
                </p>
              ) : null}
            </div>
          ) : null}
        </dl>

        <dl className="space-y-1.5">
          <Eyebrow>Sanidade</Eyebrow>
          <SummaryRow
            label="Saudáveis"
            value={<Count status="healthy" value={summary.health.healthy} />}
          />
          <SummaryRow
            label="Em atenção"
            value={<Count status="attention" value={summary.health.attention} />}
          />
          <SummaryRow
            label="Atrasados"
            value={<Count status="overdue" value={summary.health.overdue} />}
          />
          <SummaryRow
            label="Próximo manejo"
            value={nextActivity ? formatDate(nextActivity.date) : NONE}
            suffix={
              nextActivity
                ? `${TREATMENT_TYPE_LABEL[nextActivity.type]} · ${nextActivity.heads} ${
                    nextActivity.heads === 1 ? "animal" : "animais"
                  }`
                : undefined
            }
          />
        </dl>
      </div>
    </SectionCard>
  );
}
