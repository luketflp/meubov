/**
 * Pill of the manejo action: treatment types, weighing, and the three that move
 * the herd (transferência, venda, entrada). Local component: the shared
 * StatusPill has fixed status labels, whereas here they are the manejo actions.
 */
import { MANEJO_ACTION_LABEL, type ManejoAction } from "@/components/manejo/helpers";
import { cn } from "@/lib/utils";

const ACTION_STYLES: Record<ManejoAction, string> = {
  vaccine: "bg-healthy-soft text-healthy",
  deworming: "bg-scheduled-soft text-scheduled",
  medication: "bg-attention-soft text-attention",
  exam: "bg-fmd-soft text-fmd",
  weighing: "bg-brand-soft text-brand",
  // Carried over from the old movement pills, so the colors farmers already
  // read as entrada/saída/transferência survive the move into Manejo.
  entry: "bg-healthy-soft text-healthy",
  sale: "bg-fmd-soft text-fmd",
  transfer: "bg-scheduled-soft text-scheduled",
};

interface ManejoTypePillProps {
  action: ManejoAction;
  className?: string;
}

export function ManejoTypePill({ action, className }: ManejoTypePillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        ACTION_STYLES[action],
        className
      )}
    >
      {MANEJO_ACTION_LABEL[action]}
    </span>
  );
}
