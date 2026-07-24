/**
 * Pill of the movement type (purchase, sale or transfer).
 * Local component: the shared StatusPill has fixed status labels,
 * whereas here the labels are the movement types.
 */
import type { MovementType } from "@/lib/types";
import { MOVEMENT_TYPE_LABEL } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

const TYPE_STYLES: Record<MovementType, string> = {
  purchase: "bg-healthy-soft text-healthy",
  sale: "bg-fmd-soft text-fmd",
  transfer: "bg-scheduled-soft text-scheduled",
};

/** pt-BR labels of the movement types (canonical from lib/domain). */
export const TYPE_LABELS = MOVEMENT_TYPE_LABEL;

interface MovementTypePillProps {
  type: MovementType;
  className?: string;
}

export function MovementTypePill({ type, className }: MovementTypePillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        TYPE_STYLES[type],
        className
      )}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}
