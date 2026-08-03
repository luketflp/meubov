"use client";

import { useId } from "react";
import { NeloreMark } from "@/components/ui/nelore-mark";
import { cn } from "@/lib/utils";

/* Head-and-ear crop of the full 1348x1084 artwork — legible at small sizes
   and keeps the ear tag (pivot 655,540) in frame. Corridors that animate
   outside the crop simply reveal off-screen. */
const HEAD_CROP_VIEWBOX = "20 40 720 900";

interface LoadingInlineProps {
  message?: string;
  className?: string;
}

/**
 * Compact inline loading lockup for data-loading states inside pages and
 * components: the looping Nelore head with the MeuBov wordmark to its right.
 * Client component so `useId` can give each instance a unique mask id —
 * several of these can load side by side.
 */
export function LoadingInline({ message, className }: LoadingInlineProps) {
  const maskId = `nelore-inline-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <div
      role="status"
      aria-label={message ?? "Carregando"}
      className={cn("flex items-center justify-center gap-3 py-6", className)}
    >
      <NeloreMark
        viewBox={HEAD_CROP_VIEWBOX}
        className="w-12 shrink-0"
        durationMs={2500}
        maskId={maskId}
        /* clip to the head crop — the full artwork extends past this viewBox */
        style={{ display: "block", overflow: "hidden" }}
      />
      <div className="text-left">
        <p className="font-heading text-lg leading-none font-semibold text-brand">
          MeuBov
        </p>
        {message ? (
          <p className="mt-1 animate-pulse text-xs text-ink-soft">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
