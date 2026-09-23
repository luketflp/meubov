import type { ReactNode } from "react";
import type { ManejoProgress } from "@/components/manejo/helpers";
import { cn } from "@/lib/utils";

interface ManejoProgressBarProps {
  progress: ManejoProgress;
  /** A venda: the bar splits into boiada, dúvida and refugo. */
  sale?: boolean;
  className?: string;
}

/**
 * Progress of a manejo session: filled bar (done + skipped over total) with
 * the handled count. The skipped share is rendered in the attention tone so
 * the farmer sees at a glance how much of the line actually got the action.
 * A venda shows instead where each animal went: boiada, dúvida or refugo.
 */
export function ManejoProgressBar({ progress, sale = false, className }: ManejoProgressBarProps) {
  const share = (count: number) => (progress.total === 0 ? 0 : (count / progress.total) * 100);
  const handled = progress.total - progress.pending;

  return (
    <div className={cn("space-y-1", className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={handled}
        aria-label="Andamento do manejo"
        className="flex h-2 w-full overflow-hidden rounded-full bg-surface"
      >
        <div className="h-full bg-brand" style={{ width: `${share(progress.done)}%` }} />
        {sale ? (
          <>
            <div className="h-full bg-attention" style={{ width: `${share(progress.held)}%` }} />
            <div className="h-full bg-fmd" style={{ width: `${share(progress.rejected)}%` }} />
            <div
              className="h-full bg-ink-soft/40"
              style={{ width: `${share(progress.skipped)}%` }}
            />
          </>
        ) : (
          <div className="h-full bg-attention" style={{ width: `${share(progress.skipped)}%` }} />
        )}
      </div>
      {sale ? (
        <p className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-ink-soft">
          <span>
            <span className="font-mono font-medium text-ink">
              {handled}/{progress.total}
            </span>{" "}
            apartados
          </span>
          <Key className="bg-brand">{progress.done} boiada</Key>
          {progress.held > 0 ? <Key className="bg-attention">{progress.held} dúvida</Key> : null}
          {progress.rejected > 0 ? (
            <Key className="bg-fmd">{progress.rejected} refugo</Key>
          ) : null}
          {progress.skipped > 0 ? <span>{progress.skipped} pulados</span> : null}
          <span>{progress.pending > 0 ? `${progress.pending} pendentes` : "concluído"}</span>
        </p>
      ) : (
        <p className="text-xs text-ink-soft">
          <span className="font-mono font-medium text-ink">
            {progress.done + progress.skipped}/{progress.total}
          </span>{" "}
          manejados
          {progress.skipped > 0 ? ` · ${progress.skipped} pulados` : ""}
          {progress.pending > 0 ? ` · ${progress.pending} pendentes` : " · concluído"}
        </p>
      )}
    </div>
  );
}

/** One of the venda's lists in the line under the bar, dotted in its segment's tone. */
function Key({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 shrink-0 rounded-full", className)} aria-hidden />
      {children}
    </span>
  );
}
