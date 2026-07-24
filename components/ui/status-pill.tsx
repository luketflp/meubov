import { StatusDot, type StatusVisual } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";

const pillStyles: Record<StatusVisual, string> = {
  healthy: "bg-healthy-soft text-healthy",
  attention: "bg-attention-soft text-attention",
  overdue: "bg-overdue-soft text-overdue",
  scheduled: "bg-scheduled-soft text-scheduled",
  done: "bg-healthy-soft text-healthy",
  high: "bg-overdue-soft text-overdue",
  good: "bg-healthy-soft text-healthy",
  light: "bg-scheduled-soft text-scheduled",
  fmd: "bg-fmd-soft text-fmd",
};

const pillLabels: Record<StatusVisual, string> = {
  healthy: "Saudável",
  attention: "Atenção",
  overdue: "Atrasado",
  scheduled: "Agendado",
  done: "Feito",
  high: "Lotação alta",
  good: "Lotação boa",
  light: "Folgada",
  fmd: "Aftosa",
};

interface StatusPillProps {
  status: StatusVisual;
  withDot?: boolean;
  className?: string;
}

export function StatusPill({ status, withDot = false, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        pillStyles[status],
        className
      )}
    >
      {withDot ? <StatusDot status={status} className="size-1.5" /> : null}
      {pillLabels[status]}
    </span>
  );
}
