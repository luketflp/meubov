/**
 * The A4 sheet every export prints on: the farm's header, the body, and a
 * "Gerado no MeuBov" footer. On screen the sheet is drawn at A4 size with a
 * shadow (report previews); on paper it drops its frame and the @page margin
 * in globals.css takes over, so long tables flow onto more pages.
 *
 * Also the blocks the documents are built from: identification fields, a row
 * of figures, a section title, a table and signature lines.
 */
import type { ReactNode } from "react";
import { NELORE_HEAD_VIEWBOX, NELORE_PATH } from "@/components/ui/nelore-mark";
import { formatNumber } from "@/lib/domain/format";
import { formatCell, type ExportContext, type ExportTable } from "@/lib/export/table";
import { cn } from "@/lib/utils";

/** The brand mark drawn still, with the ear tag in place: it prints the same every time. */
export function FarmMark({ className }: { className?: string }) {
  return (
    <svg viewBox={NELORE_HEAD_VIEWBOX} aria-hidden className={cn("overflow-hidden", className)}>
      <g fill="var(--color-mark)" transform="translate(0,1084) scale(0.1,-0.1)">
        <path d={NELORE_PATH} />
      </g>
      <rect x="610" y="535" width="95" height="80" rx="22" fill="var(--color-brand)" />
    </svg>
  );
}

export function A4Sheet({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <article
      className={cn(
        "mx-auto flex w-[210mm] min-h-[297mm] flex-col gap-5 bg-white px-[14mm] pt-[12mm] pb-[10mm] text-ink shadow-[0_1px_2px_rgba(35,32,27,0.12),0_8px_24px_rgba(35,32,27,0.10)]",
        "print:min-h-0 print:w-auto print:p-0 print:shadow-none",
        className
      )}
    >
      {children}
    </article>
  );
}

export interface PrintFarm {
  name: string;
  municipality: string;
  stateRegistration: string;
  hectares: number;
}

export function PrintHeader({ farm, title, subtitle }: { farm: PrintFarm; title: string; subtitle?: string }) {
  const facts = [
    farm.municipality,
    farm.stateRegistration ? `IE ${farm.stateRegistration}` : "",
    farm.hectares > 0 ? `${formatNumber(farm.hectares, Number.isInteger(farm.hectares) ? 0 : 1)} ha` : "",
  ].filter(Boolean);
  return (
    <header className="flex items-end justify-between gap-4 border-b-2 border-brand pb-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <FarmMark className="size-9 shrink-0" />
        <div className="min-w-0">
          <p className="font-heading text-[17px] leading-tight font-semibold">{farm.name}</p>
          {facts.length > 0 ? <p className="text-[11px] text-ink-soft">{facts.join(" · ")}</p> : null}
        </div>
      </div>
      <div className="text-right">
        <h1 className="font-heading text-[21px] leading-[26px] font-semibold">{title}</h1>
        {subtitle ? <p className="text-[11.5px] text-ink-soft">{subtitle}</p> : null}
      </div>
    </header>
  );
}

export function PrintFooter({ context }: { context: ExportContext }) {
  return (
    <footer className="mt-auto border-t border-hairline pt-2 text-[10px] text-ink-soft">
      Gerado no MeuBov em {context.generatedAt}
      {context.userName ? ` por ${context.userName}` : ""}
      {context.filters.length > 0 ? ` · ${context.filters.join(" · ")}` : ""}
    </footer>
  );
}

export function PrintSection({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid-page">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-[15px] font-semibold">{title}</h2>
        {note ? <span className="text-[11px] text-ink-soft">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

const alignRight = (table: ExportTable, i: number) => {
  const kind = table.columns[i]?.kind;
  return kind === "number" || kind === "money";
};

/** An {@link ExportTable} as a print table; `totals` is an optional last row in bold. */
export function PrintTable({ table, totals }: { table: ExportTable; totals?: (string | number | null)[] }) {
  return (
    <table className="w-full border-collapse text-[12px] leading-4">
      <thead className="table-header-group">
        <tr>
          {table.columns.map((column, i) => (
            <th
              key={i}
              className={cn(
                "border-b-[1.5px] border-ink px-2 py-1.5 text-[10.5px] font-semibold tracking-wide text-ink-soft uppercase",
                alignRight(table, i) ? "text-right" : "text-left"
              )}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, r) => (
          <tr key={r} className="break-inside-avoid">
            {row.map((cell, i) => (
              <td
                key={i}
                className={cn(
                  "border-b border-hairline px-2 py-1",
                  alignRight(table, i) ? "text-right font-mono" : "text-left"
                )}
              >
                {formatCell(cell, table.columns[i])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {totals ? (
        <tfoot className="table-row-group">
          <tr>
            {totals.map((cell, i) => (
              <td
                key={i}
                className={cn(
                  "border-t-[1.5px] border-ink px-2 py-1.5 font-semibold",
                  alignRight(table, i) ? "text-right font-mono" : "text-left"
                )}
              >
                {cell === null ? "" : typeof cell === "number" ? formatCell(cell, table.columns[i]) : cell}
              </td>
            ))}
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}

/** Label/value pairs in a bordered grid: who, where, which sale. */
export function PrintFields({ fields, columns = 3 }: { fields: [string, ReactNode][]; columns?: number }) {
  return (
    <dl
      className="grid gap-x-4 gap-y-2 rounded-md border border-hairline px-3 py-2.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[10px] tracking-wide text-ink-soft uppercase">{label}</dt>
          <dd className="mt-0.5 text-[12.5px] font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A row of big figures: cabeças, peso, arrobas, valor. */
export function PrintFigures({ figures }: { figures: { label: string; value: string; note?: string }[] }) {
  return (
    <div
      className="grid rounded-md border border-hairline break-inside-avoid"
      style={{ gridTemplateColumns: `repeat(${figures.length}, minmax(0, 1fr))` }}
    >
      {figures.map((figure, i) => (
        <div key={figure.label} className={cn("px-3 py-2.5", i > 0 && "border-l border-hairline")}>
          <p className="text-[10px] tracking-wide text-ink-soft uppercase">{figure.label}</p>
          <p className="mt-0.5 font-mono text-[17px] font-medium whitespace-nowrap">{figure.value}</p>
          {figure.note ? <p className="text-[10.5px] text-ink-soft">{figure.note}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function PrintSignatures({ labels }: { labels: string[] }) {
  return (
    <div
      className="grid gap-10 pt-10 break-inside-avoid"
      style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}
    >
      {labels.map((label) => (
        <p key={label} className="border-t border-ink pt-1.5 text-center text-[11px] text-ink-soft">
          {label}
        </p>
      ))}
    </div>
  );
}

export function PrintNote({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-4 text-ink-soft">{children}</p>;
}
