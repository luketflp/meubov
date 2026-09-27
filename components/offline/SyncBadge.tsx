"use client";

/** The fila's count on the Manejo tab and the sidebar's Manejo row. */
import { useHerdStore } from "@/lib/store/useHerdStore";
import { cn } from "@/lib/utils";

export function SyncBadge({ className }: { className?: string }) {
  const count = useHerdStore((s) => s.outboxCount);
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 font-mono text-[10px] leading-none font-semibold text-primary-foreground",
        className
      )}
    >
      {count > 99 ? "99+" : count}
      <span className="sr-only"> a enviar</span>
    </span>
  );
}
