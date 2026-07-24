import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiDelta {
  text: string;
  positive: boolean;
}

interface KpiCardProps {
  label: string;
  value: ReactNode;
  sub?: string;
  delta?: KpiDelta;
  icon?: LucideIcon;
  className?: string;
}

export function KpiCard({ label, value, sub, delta, icon: Icon, className }: KpiCardProps) {
  return (
    <div className={cn("rounded-lg border border-hairline bg-panel p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">
          {label}
        </p>
        {Icon ? <Icon className="size-4 shrink-0 text-ink-soft" aria-hidden /> : null}
      </div>
      <div className="mt-1.5 font-mono text-2xl font-medium text-ink">{value}</div>
      {delta || sub ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {delta ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium",
                delta.positive ? "text-healthy" : "text-overdue"
              )}
            >
              {delta.positive ? (
                <ArrowUpRight className="size-3.5" aria-hidden />
              ) : (
                <ArrowDownRight className="size-3.5" aria-hidden />
              )}
              {delta.text}
            </span>
          ) : null}
          {sub ? <span className="text-xs text-ink-soft">{sub}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
