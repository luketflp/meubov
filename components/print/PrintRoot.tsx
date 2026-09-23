"use client";

/**
 * Prints the list an Exportar menu asked for. The job's sheet is invisible on
 * screen; once it has rendered, the browser's print dialog opens, and when the
 * dialog closes the job is cleared. AppShell hides the app on paper meanwhile.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { usePrintStore } from "@/lib/store/usePrintStore";
import { usePrintFarm } from "@/components/export/useExportContext";
import { A4Sheet, PrintFooter, PrintHeader, PrintSection, PrintTable } from "@/components/print/PrintSheet";

export function PrintRoot() {
  const job = usePrintStore((s) => s.job);
  const clear = usePrintStore((s) => s.clear);
  const farm = usePrintFarm();

  useEffect(() => {
    if (!job) return;
    window.addEventListener("afterprint", clear, { once: true });
    // Wait for the sheet to paint and the menu's close animation (100 ms) to
    // end, so neither is missing from nor stuck on the paper.
    const timer = window.setTimeout(() => window.print(), 150);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", clear);
    };
  }, [job, clear]);

  // Some mobile browsers never fire afterprint; leaving the screen drops the job
  // so the next page prints itself.
  const pathname = usePathname();
  useEffect(() => clear(), [pathname, clear]);

  if (!job) return null;
  // Rebanho has 13 columns: past 8 a portrait page squeezes every cell.
  const landscape = job.tables.some((table) => table.columns.length > 8);
  return (
    <div className="hidden print:block">
      {landscape ? <style>{"@page { size: A4 landscape; }"}</style> : null}
      <A4Sheet>
        <PrintHeader farm={farm} title={job.title} subtitle={job.subtitle} />
        {job.tables.map((table, i) =>
          job.tables.length > 1 ? (
            <PrintSection key={i} title={table.title} note={table.rows.length === 1 ? "1 linha" : `${table.rows.length} linhas`}>
              <PrintTable table={table} />
            </PrintSection>
          ) : (
            <PrintTable key={i} table={table} />
          )
        )}
        <PrintFooter context={job.context} />
      </A4Sheet>
    </div>
  );
}
