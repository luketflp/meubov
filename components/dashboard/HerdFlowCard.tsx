/**
 * "Evolução do rebanho": the herd at the start of the 12 months, what came in
 * and what left, and the herd today — a floating-bar waterfall (herdFlow).
 * Each entrada and saída opens the screen that lists it.
 */
import Link from "next/link";
import type { HerdFlow } from "@/lib/store/dashboard";
import { formatDate } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

type StepKind = "start" | "in" | "out" | "end";

const BAR: Record<StepKind, string> = {
  start: "bg-ink-soft",
  in: "bg-healthy",
  out: "bg-fmd",
  end: "bg-brand",
};

const VALUE: Record<StepKind, string> = {
  start: "text-ink",
  in: "text-healthy",
  out: "text-fmd",
  end: "text-ink",
};

export function HerdFlowCard({ flow, className }: { flow: HerdFlow; className?: string }) {
  const steps: { label: string; value: number; kind: StepKind; href?: string }[] = [
    { label: `Em ${formatDate(flow.since)}`, value: flow.start, kind: "start" },
    { label: "Nascimentos", value: flow.births, kind: "in", href: "/nascimentos" },
    { label: "Compras", value: flow.purchases, kind: "in", href: "/manejo?tipo=entry#historico" },
    { label: "Vendas", value: flow.sales, kind: "out", href: "/manejo?tipo=sale#historico" },
    { label: "Mortes", value: flow.deaths, kind: "out", href: "/baixas?motivo=mortes" },
    ...(flow.others > 0
      ? [
          {
            label: "Outras saídas",
            value: flow.others,
            kind: "out" as const,
            href: "/baixas?motivo=outras",
          },
        ]
      : []),
    { label: "Rebanho hoje", value: flow.end, kind: "end" },
  ];
  const peak = Math.max(1, flow.start + flow.births + flow.purchases, flow.end);

  let level = 0;
  const rows = steps.map((step) => {
    let from = 0;
    let to = step.value;
    if (step.kind === "start") level = step.value;
    if (step.kind === "in") {
      from = level;
      to = level + step.value;
      level = to;
    }
    if (step.kind === "out") {
      to = level;
      from = Math.max(0, level - step.value);
      level = from;
    }
    return { ...step, from, to };
  });

  return (
    <SectionCard title="Evolução do rebanho" subtitle="últimos 12 meses" className={className}>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => {
          const strong = row.kind === "start" || row.kind === "end";
          const cells = (
            <>
              <span
                className={cn(
                  "text-[13px]",
                  strong ? "font-medium text-ink" : "text-ink-soft",
                  row.href && "underline-offset-2 group-hover:text-ink group-hover:underline"
                )}
              >
                {row.label}
              </span>
              <span aria-hidden className="relative h-3">
                <span
                  className={cn("absolute inset-y-0 rounded-[3px]", BAR[row.kind])}
                  style={{
                    left: `${(row.from / peak) * 100}%`,
                    width: `${((row.to - row.from) / peak) * 100}%`,
                  }}
                />
              </span>
              <span className={cn("text-right font-mono text-[13px] font-medium", VALUE[row.kind])}>
                {row.value === 0 ? "" : row.kind === "in" ? "+" : row.kind === "out" ? "−" : ""}
                {formatNumber(row.value)}
              </span>
            </>
          );
          const grid = "grid min-h-7 grid-cols-[7.5rem_minmax(0,1fr)_3rem] items-center gap-x-3";
          return (
            <li
              key={row.label}
              className={cn(row.kind === "end" && "mt-1 border-t border-hairline pt-2")}
            >
              {row.href ? (
                <Link
                  href={row.href}
                  className={cn(grid, "group -mx-2 rounded-md px-2 hover:bg-surface")}
                >
                  {cells}
                </Link>
              ) : (
                <div className={grid}>{cells}</div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-ink-soft">
        Nascimentos, compras, vendas e mortes lançados desde {formatDate(flow.since)}. Animais
        cadastrados sem entrada contam desde o início.
      </p>
    </SectionCard>
  );
}
