/**
 * Attention notice with the MarketNotice anatomy: a warning that is not an
 * error, such as a bull with fewer doses than cows or a bull that ran out at
 * the brete. The text size follows `className`.
 */
import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function AttentionNotice({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2.5 rounded-lg bg-attention-soft px-4 py-3 text-sm text-attention",
        className
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
