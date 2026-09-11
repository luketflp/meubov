"use client";

/**
 * One lote inside its invernada's section. The whole card opens the ficha —
 * the actions live in the ••• menu on top of it, so nothing on the card face
 * competes with the link.
 */
import Link from "next/link";
import { ChevronRight, TrendingUp } from "lucide-react";
import type { Invernada } from "@/lib/types";
import type { LotCardRow } from "@/lib/store/selectors";
import { formatArroba, formatKg, formatNumber } from "@/lib/domain/format";
import { LotCardMenu } from "@/components/lots/lot-card-menu";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";

/** Health counts in reading order; a zero is dropped, except "saudáveis". */
function HealthCounts({ health }: { health: LotCardRow["health"] }) {
  const counts = [
    { status: "healthy" as const, value: health.healthy, label: "saudáveis", always: true },
    { status: "attention" as const, value: health.attention, label: "atenção", always: false },
    { status: "overdue" as const, value: health.overdue, label: "atrasados", always: false },
  ].filter((item) => item.always || item.value > 0);

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-soft">
      {counts.map((item) => (
        <span key={item.status} className="inline-flex items-center gap-1.5">
          <StatusDot status={item.status} />
          <span className="font-mono text-ink">{item.value}</span> {item.label}
        </span>
      ))}
    </div>
  );
}

interface LotCardProps {
  row: LotCardRow;
  invernada: Invernada | null;
}

export function LotCard({ row, invernada }: LotCardProps) {
  const { lot, heads, totalWeightKg, totalArrobas, adg, health } = row;

  return (
    <article className="relative min-w-0 flex-1 basis-72 sm:max-w-[32rem]">
      <Link
        href={`/lots/${lot.id}`}
        aria-label={`Abrir lote ${lot.name}`}
        className="group flex min-h-11 flex-col gap-3 rounded-lg border border-hairline bg-panel p-3.5 transition-colors hover:border-brand/45 hover:shadow-sm"
      >
        <div className="flex items-start gap-2 pr-10">
          <span className="min-w-0 truncate font-heading text-[15px] font-semibold text-ink underline-offset-2 group-hover:underline">
            {lot.name}
          </span>
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-ink-soft" aria-hidden />
          {lot.needsReview ? (
            <Badge variant="outline" className="shrink-0">
              Revisar cadastro
            </Badge>
          ) : null}
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[28px] leading-8 font-semibold text-ink">{heads}</span>
          <span className="text-xs text-ink-soft">{heads === 1 ? "cabeça" : "cabeças"}</span>
        </div>

        <dl className="space-y-1.5 border-t border-hairline pt-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-soft">Peso total</dt>
            <dd className="font-mono text-ink">
              {formatKg(totalWeightKg)} · {formatArroba(totalArrobas)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-soft">GMD 120 d</dt>
            <dd className="flex items-center gap-1.5 font-mono text-ink">
              {adg === null ? (
                "—"
              ) : (
                <>
                  <TrendingUp className="size-3.5 text-healthy" aria-hidden />
                  {formatNumber(adg, 3)} kg/dia
                </>
              )}
            </dd>
          </div>
        </dl>

        <div className="border-t border-hairline pt-2.5">
          <HealthCounts health={health} />
        </div>
      </Link>

      <div className="absolute top-2 right-2">
        <LotCardMenu row={row} invernada={invernada} />
      </div>
    </article>
  );
}
