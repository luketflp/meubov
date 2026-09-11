import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Pills shown next to the title (e.g. "Encerrado"). */
  badges?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, badges, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {badges ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="font-heading text-2xl font-semibold text-ink">{title}</h1>
            <div className="flex items-center gap-1">{badges}</div>
          </div>
        ) : (
          <h1 className="font-heading text-2xl font-semibold text-ink">{title}</h1>
        )}
        {subtitle ? <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
