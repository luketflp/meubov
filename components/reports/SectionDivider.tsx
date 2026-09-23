import type { ReactNode } from "react";

/**
 * Thin section divider with an uppercase heading, drawn as the Painel's. On
 * the phone its action takes a line of its own.
 */
export function SectionDivider({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
      <h2 className="font-heading text-sm font-semibold tracking-wide text-ink-soft uppercase">{title}</h2>
      <span className="h-px min-w-8 flex-1 bg-hairline" aria-hidden />
      {action ? <div className="w-full sm:w-auto">{action}</div> : null}
    </div>
  );
}
