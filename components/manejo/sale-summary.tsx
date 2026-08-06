"use client";

/**
 * Resumo final of a venda: the romaneio arithmetic of the batch that passed the
 * chute — totals on one side, per-head averages on the other, FUNRURAL off the
 * gross. Mirrors the frigorífico spreadsheet the farmer reconciles against.
 */
import { Pencil } from "lucide-react";
import type { ManejoSession } from "@/lib/types";
import { saleSummary, FUNRURAL_RATE } from "@/lib/domain/movements";
import {
  formatArroba,
  formatCurrency,
  formatKg,
  formatNumber,
  formatPercent,
} from "@/lib/domain/format";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";

interface SaleSummaryCardProps {
  session: ManejoSession;
  /** Opens the rendimento modal again — only offered while the venda is open. */
  onEditYield?: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="font-mono text-sm text-ink">{value}</dd>
    </div>
  );
}

export function SaleSummaryCard({ session, onEditYield }: SaleSummaryCardProps) {
  const summary = saleSummary(session);
  if (summary === null) return null;

  const heads = `${summary.heads} ${summary.heads === 1 ? "cabeça" : "cabeças"}`;
  const partial =
    summary.weighedHeads < summary.heads ? ` (${summary.weighedHeads} pesadas)` : "";

  return (
    <SectionCard
      title="Resumo da venda"
      action={
        summary.carcassYieldPct !== null ? (
          <span className="inline-flex items-center gap-1 text-xs text-ink-soft">
            Rendimento {formatPercent(summary.carcassYieldPct)}
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
            <Row label="Peso bruto" value={formatKg(summary.totalWeightKg)} />
          ) : null}
          {summary.totalCarcassKg !== null ? (
            <Row
              label="Peso de carcaça"
              value={`${formatNumber(summary.totalCarcassKg)} kg`}
            />
          ) : null}
          {summary.totalCarcassArrobas !== null ? (
            <Row label="@ de carcaça" value={formatArroba(summary.totalCarcassArrobas)} />
          ) : null}
          {summary.grossBrl !== null ? (
            <Row label="Total bruto" value={formatCurrency(summary.grossBrl)} />
          ) : null}
          {summary.funruralBrl !== null ? (
            <Row
              label={`FUNRURAL (${formatPercent(FUNRURAL_RATE * 100)})`}
              value={`− ${formatCurrency(summary.funruralBrl)}`}
            />
          ) : null}
          {summary.netBrl !== null ? (
            <Row label="Total líquido" value={formatCurrency(summary.netBrl)} />
          ) : null}
        </dl>

        <dl className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">
            Média por cabeça
          </p>
          {summary.avgWeightKg !== null ? (
            <Row label="Peso vivo" value={formatKg(summary.avgWeightKg)} />
          ) : null}
          {summary.avgLiveArrobas !== null ? (
            <Row label="@ viva (÷30)" value={formatArroba(summary.avgLiveArrobas)} />
          ) : null}
          {summary.avgCarcassArrobas !== null ? (
            <Row label="@ de carcaça (÷15)" value={formatArroba(summary.avgCarcassArrobas)} />
          ) : null}
          {summary.grossPerHeadBrl !== null ? (
            <Row label="R$/cabeça" value={formatCurrency(summary.grossPerHeadBrl)} />
          ) : null}
          {summary.netPerHeadBrl !== null ? (
            <Row label="R$/cabeça líquido" value={formatCurrency(summary.netPerHeadBrl)} />
          ) : null}
        </dl>
      </div>
    </SectionCard>
  );
}
