/** Where a ledger row stands, on the rows of Lançamentos and the phone's sheet. */
import type { LedgerStatus } from "@/lib/domain/ledger";
import { cn } from "@/lib/utils";

const STATUS_PILL: Record<LedgerStatus, { label: string; className: string }> = {
  paid: { label: "pago", className: "bg-healthy-soft text-healthy" },
  received: { label: "recebido", className: "bg-healthy-soft text-healthy" },
  payable: { label: "a pagar", className: "bg-attention-soft text-attention" },
  receivable: { label: "a receber", className: "bg-scheduled-soft text-scheduled" },
  overdue: { label: "vencida", className: "bg-overdue-soft text-overdue" },
};

export function LedgerStatusPill({ status }: { status: LedgerStatus }) {
  const pill = STATUS_PILL[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        pill.className
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {pill.label}
    </span>
  );
}
