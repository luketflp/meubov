import type { ManejoProgress } from "@/components/manejo/helpers";
import { cn } from "@/lib/utils";

interface ManejoProgressBarProps {
  progress: ManejoProgress;
  className?: string;
}

/**
 * Progress of a manejo session: filled bar (done + skipped over total) with
 * the handled count. The skipped share is rendered in the attention tone so
 * the farmer sees at a glance how much of the line actually got the action.
 */
export function ManejoProgressBar({ progress, className }: ManejoProgressBarProps) {
  const donePct = progress.total === 0 ? 0 : (progress.done / progress.total) * 100;
  const skippedPct = progress.total === 0 ? 0 : (progress.skipped / progress.total) * 100;

  return (
    <div className={cn("space-y-1", className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done + progress.skipped}
        aria-label="Andamento do manejo"
        className="flex h-2 w-full overflow-hidden rounded-full bg-surface"
      >
        <div className="h-full bg-brand" style={{ width: `${donePct}%` }} />
        <div className="h-full bg-attention" style={{ width: `${skippedPct}%` }} />
      </div>
      <p className="text-xs text-ink-soft">
        <span className="font-mono font-medium text-ink">
          {progress.done + progress.skipped}/{progress.total}
        </span>{" "}
        manejados
        {progress.skipped > 0 ? ` · ${progress.skipped} pulados` : ""}
        {progress.pending > 0 ? ` · ${progress.pending} pendentes` : " · concluído"}
      </p>
    </div>
  );
}
