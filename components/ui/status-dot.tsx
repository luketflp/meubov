import type { AnimalStatus, StockingRateClass, TreatmentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Every state with its own color in the design system. */
export type StatusVisual = AnimalStatus | TreatmentStatus | StockingRateClass | "fmd";

const dotColors: Record<StatusVisual, string> = {
  healthy: "bg-healthy",
  attention: "bg-attention",
  overdue: "bg-overdue",
  scheduled: "bg-scheduled",
  done: "bg-healthy",
  high: "bg-overdue",
  good: "bg-healthy",
  light: "bg-scheduled",
  fmd: "bg-fmd",
};

interface StatusDotProps {
  status: StatusVisual;
  className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", dotColors[status], className)}
    />
  );
}
