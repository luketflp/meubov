"use client";

/**
 * Writes export tables to a file and hands it to the browser, with the farm's
 * context on the "Sobre" sheet. One busy key at a time, so the button clicked
 * can show it is working.
 */
import { useState } from "react";
import { toast } from "sonner";
import { todayISO } from "@/lib/domain/dates";
import { csvBlob } from "@/lib/export/csv";
import { downloadBlob } from "@/lib/export/download";
import { exportFileName } from "@/lib/export/fileName";
import type { ExportTable } from "@/lib/export/table";
import { xlsxBlob } from "@/lib/export/xlsx";
import { useExportContext } from "@/components/export/useExportContext";

export type DownloadFormat = "xlsx" | "csv";

export function useDownload() {
  const context = useExportContext();
  const [busy, setBusy] = useState<string | null>(null);

  async function download(
    key: string,
    name: string,
    tables: ExportTable[],
    format: DownloadFormat,
    filters: string[] = []
  ): Promise<void> {
    if (busy !== null || tables.length === 0) return;
    setBusy(key);
    try {
      const ctx = context(filters);
      const fileName = exportFileName(name, ctx.farmName, todayISO(), format);
      const blob = format === "csv" ? csvBlob(tables[0]) : await xlsxBlob(tables, ctx);
      downloadBlob(blob, fileName);
    } catch {
      toast.error("Não foi possível gerar a planilha. Tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  return { download, busy };
}
