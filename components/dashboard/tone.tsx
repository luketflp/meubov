/**
 * The Painel's urgency tones, the status colors the pills already use, with
 * the small pill and the icon tile the agenda draws in them.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "overdue" | "attention" | "scheduled" | "healthy" | "brand" | "neutral";

const SOFT: Record<Tone, string> = {
  overdue: "bg-overdue-soft text-overdue",
  attention: "bg-attention-soft text-attention",
  scheduled: "bg-scheduled-soft text-scheduled",
  healthy: "bg-healthy-soft text-healthy",
  brand: "bg-brand-soft text-brand",
  neutral: "bg-surface text-ink-soft ring-1 ring-hairline ring-inset",
};

/** Solid dot of each tone. */
export const DOT: Record<Tone, string> = {
  overdue: "bg-overdue",
  attention: "bg-attention",
  scheduled: "bg-scheduled",
  healthy: "bg-healthy",
  brand: "bg-brand",
  neutral: "bg-ink-soft",
};

export function TonePill({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        SOFT[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function ToneTile({ tone, icon: Icon }: { tone: Tone; icon: LucideIcon }) {
  return (
    <span
      aria-hidden
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-[9px]", SOFT[tone])}
    >
      <Icon className="size-[18px]" />
    </span>
  );
}
