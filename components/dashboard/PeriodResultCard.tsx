"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import type { PeriodResult } from "@/lib/domain/finance";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

interface PeriodResultCardProps {
  /** Consolidated revenue/cost/result of the selected period. */
  result: PeriodResult;
}

/**
 * "Resultado do período": the caixa summary of the selected window — revenue,
 * cost and the resulting balance with net margin — plus a link to the full
 * financial screen. Compact on purpose: the detail lives in /finance.
 */
export function PeriodResultCard({ result }: PeriodResultCardProps) {
  const empty = result.totalRevenue === 0 && result.totalCost === 0;
  const positive = result.result >= 0;

  return (
    <SectionCard
      title="Resultado do período"
      action={
        <Link
          href="/finance"
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver financeiro
        </Link>
      }
    >
      {empty ? (
        <EmptyState
          icon={Coins}
          title="Sem lançamentos no período"
          description="Ajuste o período para incluir meses com receita ou custo."
        />
      ) : (
        <dl className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-sm text-ink-soft">Receita</dt>
            <dd className="font-mono text-lg font-medium text-ink">
              {formatCurrency(result.totalRevenue)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-sm text-ink-soft">Custo</dt>
            <dd className="font-mono text-lg font-medium text-ink">
              {formatCurrency(result.totalCost)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 border-t border-hairline pt-3">
            <dt className="text-sm font-medium text-ink">Resultado</dt>
            <dd
              className={cn(
                "font-mono text-2xl font-semibold",
                positive ? "text-healthy" : "text-overdue"
              )}
            >
              {formatCurrency(result.result)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-xs text-ink-soft">Margem líquida</dt>
            <dd
              className={cn(
                "font-mono text-sm font-medium",
                positive ? "text-healthy" : "text-overdue"
              )}
            >
              {formatNumber(result.netMarginPct, 1)}%
            </dd>
          </div>
        </dl>
      )}
    </SectionCard>
  );
}
