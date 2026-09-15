/**
 * The doses a semen bull has left, as a pill: "Sem doses" once the stock is
 * gone, amber while a new purchase is due and green above that. The Touros tab
 * reads a bull's stock through it, so a glance down the column tells which
 * semen to buy.
 *
 * Also a count of doses with the number in mono, for running text.
 */
import { formatNumber } from "@/lib/domain/format";
import { dosesLabel, dosesNoun } from "@/components/semen/helpers";
import { cn } from "@/lib/utils";

/** At or below this many doses left, the stock asks for a purchase. */
export const LOW_STOCK_DOSES = 10;

/** {@link dosesLabel} for running text: the count in mono, the word as the text around it. */
export function MonoDoses({ doses, className }: { doses: number; className?: string }) {
  return (
    <>
      <span className={cn("font-mono", className)}>{formatNumber(doses)}</span>{" "}
      {dosesNoun(doses)}
    </>
  );
}

/** Pill tone of a stock: overdue when empty, attention when low, healthy above. */
function stockStyle(left: number): string {
  if (left <= 0) return "bg-overdue-soft text-overdue";
  if (left <= LOW_STOCK_DOSES) return "bg-attention-soft text-attention";
  return "bg-healthy-soft text-healthy";
}

export function StockPill({ left }: { left: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        stockStyle(left)
      )}
    >
      {left <= 0 ? "Sem doses" : dosesLabel(left)}
    </span>
  );
}
