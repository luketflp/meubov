/**
 * The list waiting to be printed. An Exportar menu puts a job here; PrintRoot
 * draws it as an A4 sheet, opens the browser's print dialog, and clears the
 * job once the dialog closes. While a job is set the app itself prints nothing.
 */
import { create } from "zustand";
import type { ExportContext, ExportTable } from "@/lib/export/table";

export interface PrintJob {
  title: string;
  subtitle?: string;
  tables: ExportTable[];
  context: ExportContext;
}

interface PrintStore {
  job: PrintJob | null;
  print: (job: PrintJob) => void;
  clear: () => void;
}

export const usePrintStore = create<PrintStore>()((set) => ({
  job: null,
  print: (job) => set({ job }),
  clear: () => set({ job: null }),
}));
