import { NeloreMark } from "@/components/ui/nelore-mark";
import { cn } from "@/lib/utils";

interface LoadingOverlayProps {
  message?: string;
  /** Standalone full-screen loading (AppShell boot) vs. overlay on a section. */
  fullScreen?: boolean;
  className?: string;
}

/**
 * Loading state with the animated Nelore line-art brand mark. Two modes:
 * - `fullScreen`: takes over the viewport with the MeuBov wordmark (initial load);
 * - default: absolute overlay that covers the nearest `relative` parent.
 */
export function LoadingOverlay({
  message = "Carregando…",
  fullScreen = false,
  className,
}: LoadingOverlayProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-5",
        fullScreen
          ? "min-h-dvh bg-canvas"
          : "absolute inset-0 z-10 bg-canvas/70 backdrop-blur-[2px]",
        className
      )}
    >
      {fullScreen ? (
        <div className="text-center">
          <p className="font-heading text-3xl font-semibold text-brand">MeuBov</p>
          <p className="mt-1 text-sm text-ink-soft">Gestão de rebanho de corte</p>
        </div>
      ) : null}
      {/* Shorter cycle than the hero: a full silhouette must appear within ~2s
          of a typical load; distinct maskId in case an overlay ever coexists
          with another NeloreMark instance. */}
      <NeloreMark
        className={fullScreen ? "w-44" : "w-28"}
        durationMs={2500}
        maskId="nelore-reveal-overlay"
      />
      <p className="animate-pulse text-sm text-ink-soft">{message}</p>
    </div>
  );
}
