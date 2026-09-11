import type { ReactNode } from "react";

interface SummaryRowProps {
  label: string;
  value: ReactNode;
  /** Small soft note after the value, e.g. "· 90 dias". */
  suffix?: string;
}

/** One label/value line of a summary card: the venda's romaneio, the lote's resumo. */
export function SummaryRow({ label, value, suffix }: SummaryRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="text-right font-mono text-sm text-ink">
        {value}
        {suffix ? (
          <span className="ml-1 inline-block font-sans text-xs text-ink-soft">{suffix}</span>
        ) : null}
      </dd>
    </div>
  );
}
