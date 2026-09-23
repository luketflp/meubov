"use client";

/**
 * Resumo final of a venda: the romaneio arithmetic of the batch that passed the
 * chute — totals on one side, per-head averages on the other, FUNRURAL off the
 * gross. Mirrors the frigorífico spreadsheet the farmer reconciles against.
 * Only the boiada is sold: refugo and dúvida stay out of every figure.
 */
import { Pencil } from "lucide-react";
import type { ManejoSession } from "@/lib/types";
import { saleSummary, FUNRURAL_RATE } from "@/lib/domain/movements";
import { DEFAULT_CARCASS_YIELD_PCT } from "@/lib/domain/weights";
import {
  formatArroba,
  formatCurrency,
  formatKg,
  formatNumber,
  formatPercent,
} from "@/lib/domain/format";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { SummaryRow } from "@/components/ui/summary-row";

interface SaleSummaryCardProps {
  session: ManejoSession;
  /** Opens the rendimento modal again — only offered while the venda is open. */
  onEditYield?: () => void;
}

export function SaleSummaryCard({ session, onEditYield }: SaleSummaryCardProps) {
  const summary = saleSummary(session);
  if (summary === null) return null;

  const heads = `${summary.heads} ${summary.heads === 1 ? "cabeça" : "cabeças"}`;
  const partial =
    summary.weighedHeads < summary.heads ? ` (${summary.weighedHeads} pesadas)` : "";
  const setApart = summary.rejectedHeads + summary.heldHeads > 0;

  return (
    <SectionCard
      title="Resumo da venda"
      subtitle={setApart ? "Refugo e dúvida ficam fora" : undefined}
      action={
        summary.carcassYieldPct !== null ? (
          <span className="inline-flex items-center gap-1 text-xs text-ink-soft">
            Padrão {formatPercent(session.carcassYieldPct ?? DEFAULT_CARCASS_YIELD_PCT)}
            {onEditYield ? (
              <Button
                variant="ghost"
                size="sm"
                className="min-h-8 text-brand"
                onClick={onEditYield}
              >
                <Pencil aria-hidden />
                Alterar
              </Button>
            ) : null}
          </span>
        ) : undefined
      }
    >
      <p className="mb-3 text-sm text-ink-soft">
        {setApart ? "Só a boiada entra na venda: " : null}
        {heads}
        {partial}
        {summary.grossPerHeadBrl !== null ? (
          <>
            {" · "}
            <span className="font-mono font-medium text-ink">
              {formatCurrency(summary.grossPerHeadBrl)}
            </span>
            /cb
          </>
        ) : null}
      </p>

      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <dl className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Lote</p>
          {summary.totalWeightKg !== null ? (
            <SummaryRow label="Peso bruto" value={formatKg(summary.totalWeightKg)} />
          ) : null}
          {summary.totalCarcassKg !== null ? (
            <SummaryRow
              label="Peso de carcaça"
              value={`${formatNumber(summary.totalCarcassKg)} kg`}
            />
          ) : null}
          {summary.totalCarcassArrobas !== null ? (
            <SummaryRow label="@ de carcaça" value={formatArroba(summary.totalCarcassArrobas)} />
          ) : null}
          {summary.grossBrl !== null ? (
            <SummaryRow label="Total bruto" value={formatCurrency(summary.grossBrl)} />
          ) : null}
          {summary.funruralBrl !== null ? (
            <SummaryRow
              label={`FUNRURAL (${formatPercent(FUNRURAL_RATE * 100)})`}
              value={`− ${formatCurrency(summary.funruralBrl)}`}
            />
          ) : null}
          {summary.netBrl !== null ? (
            <SummaryRow label="Total líquido" value={formatCurrency(summary.netBrl)} />
          ) : null}
        </dl>

        <dl className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">
            Média por cabeça
          </p>
          {summary.carcassYieldPct !== null ? (
            <SummaryRow
              label={summary.yieldVaries ? "Rendimento médio" : "Rendimento"}
              value={formatPercent(summary.carcassYieldPct)}
            />
          ) : null}
          {summary.avgWeightKg !== null ? (
            <SummaryRow label="Peso vivo" value={formatKg(summary.avgWeightKg)} />
          ) : null}
          {summary.avgLiveArrobas !== null ? (
            <SummaryRow label="@ viva (÷30)" value={formatArroba(summary.avgLiveArrobas)} />
          ) : null}
          {summary.avgCarcassArrobas !== null ? (
            <SummaryRow label="@ de carcaça (÷15)" value={formatArroba(summary.avgCarcassArrobas)} />
          ) : null}
          {summary.grossPerHeadBrl !== null ? (
            <SummaryRow label="R$/cabeça" value={formatCurrency(summary.grossPerHeadBrl)} />
          ) : null}
          {summary.netPerHeadBrl !== null ? (
            <SummaryRow label="R$/cabeça líquido" value={formatCurrency(summary.netPerHeadBrl)} />
          ) : null}
        </dl>
      </div>
    </SectionCard>
  );
}
