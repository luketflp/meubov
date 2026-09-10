"use client";

/**
 * The one shell every overlay on the map uses: a bottom sheet on a phone, a
 * floating card in the bottom-left on a desktop.
 *
 * Having a single shell is what keeps the guided flow from feeling like five
 * different screens — a step, a warning while tracing and an invernada summary
 * all arrive in the same place, at the same size, and only the content changes.
 *
 * Pointer events: the overlay layer above the map is inert so gestures reach
 * the tiles; each panel switches them back on for itself.
 */
import { cn } from "@/lib/utils";

/** Tone of the panel — `attention` is for a trace in progress. */
type PanelTone = "default" | "attention";

const TONE_CLASS: Record<PanelTone, string> = {
  default: "bg-panel/95 border-hairline",
  attention: "bg-attention-soft/95 border-attention/30",
};

export function MapPanel({
  tone = "default",
  className,
  children,
  ...rest
}: React.ComponentProps<"section"> & { tone?: PanelTone }) {
  return (
    <section
      {...rest}
      className={cn(
        "pointer-events-auto mt-auto w-full rounded-t-2xl border p-4 shadow-lg backdrop-blur-sm",
        // Phones: the sheet spans the screen and clears the tab bar, which the
        // app shell already reserves space for below this layer.
        "max-h-[60dvh] overflow-y-auto",
        // Desktop: a card, not a sheet, so the map keeps its full width.
        "md:mb-4 md:ml-0 md:max-w-md md:rounded-2xl",
        TONE_CLASS[tone],
        className
      )}
    >
      {children}
    </section>
  );
}

/** Title + one line of "why am I looking at this", shared by every step. */
export function MapPanelHeader({
  eyebrow,
  title,
  description,
}: {
  /** Small line above the title — the step's place in the flow. */
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
}) {
  return (
    <header className="space-y-1">
      {eyebrow ? (
        <p className="text-xs font-medium tracking-wide text-ink-soft uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="font-heading text-base font-semibold text-ink">{title}</h2>
      {description ? (
        <p className="text-sm text-ink-soft">{description}</p>
      ) : null}
    </header>
  );
}

/** The row of actions at the bottom of a panel. */
export function MapPanelActions({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mt-4 flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}
