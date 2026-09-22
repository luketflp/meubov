/**
 * "Lotação por invernada": each pasture with its lotes, head count and
 * pressure, the most loaded first; the empty ones last, "Em descanso".
 */
import Link from "next/link";
import { ArrowRight, Map as MapIcon } from "lucide-react";
import type { InvernadaWithSummary } from "@/lib/store/selectors";
import { formatNumber } from "@/lib/domain/format";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { STOCKING_LABEL, StockingBar } from "@/components/lots/stocking-bar";
import { TonePill } from "@/components/dashboard/tone";

interface PaddocksCardProps {
  rows: InvernadaWithSummary[];
  /** The herd's UA/ha over every invernada. */
  herdRate: number;
}

export function PaddocksCard({ rows, herdRate }: PaddocksCardProps) {
  const sorted = [...rows].sort(
    (a, b) =>
      Number(b.headCount > 0) - Number(a.headCount > 0) ||
      b.auPerHa - a.auPerHa ||
      a.invernada.code.localeCompare(b.invernada.code, "pt-BR", { numeric: true })
  );
  const hectares = rows.reduce((sum, row) => sum + row.invernada.hectares, 0);

  return (
    <SectionCard
      title="Lotação por invernada"
      subtitle={
        rows.length === 0
          ? undefined
          : `${rows.length} ${rows.length === 1 ? "invernada" : "invernadas"} · ${formatNumber(hectares)} ha · ${formatNumber(herdRate, 2)} UA/ha no rebanho`
      }
      action={
        <Link
          href="/lots"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver lotes
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={MapIcon}
          title="Nenhuma invernada"
          description="Cadastre as invernadas no Mapa para acompanhar a lotação de cada pasto."
        />
      ) : (
        <ul className="-my-2.5 divide-y divide-hairline">
          {sorted.map(({ invernada, lots, headCount, auPerHa, classification }) => (
            <li key={invernada.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {invernada.name ? (
                    <>
                      <span className="font-mono font-normal text-ink-soft">{invernada.code}</span>{" "}
                      {invernada.name}
                    </>
                  ) : (
                    `Invernada ${invernada.code}`
                  )}
                </p>
                <p className="mt-px truncate text-xs text-ink-soft">
                  {headCount > 0
                    ? `${lots.map((lot) => lot.name).join(", ")} · ${formatNumber(headCount)} cab · ${STOCKING_LABEL[classification]}`
                    : lots.length > 0
                      ? `${lots.map((lot) => lot.name).join(", ")} · sem animais`
                      : `Sem lote · ${formatNumber(invernada.hectares)} ha`}
                </p>
              </div>
              {headCount > 0 ? (
                <StockingBar
                  auPerHa={auPerHa}
                  classification={classification}
                  compact
                  className="w-28 shrink-0 sm:w-32"
                />
              ) : (
                <TonePill tone="neutral">Em descanso</TonePill>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
