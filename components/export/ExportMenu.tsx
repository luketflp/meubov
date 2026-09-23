"use client";

/**
 * The "Exportar" button of a list screen. The file is the screen: the same
 * rows, filter and order, built by the caller from the selectors it draws
 * with. When a filter narrows the list, the menu also offers the whole list.
 * Formats: an .xlsx (one sheet per table plus "Sobre"), a CSV of the first
 * table, or an A4 print the browser can save as PDF.
 *
 * Money columns leave only for a member who may see the Financeiro.
 */
import { useState } from "react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { ChevronDown, Download, FileSpreadsheet, Printer, Sheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useExportContext } from "@/components/export/useExportContext";
import { csvBlob } from "@/lib/export/csv";
import { downloadBlob } from "@/lib/export/download";
import { exportFileName } from "@/lib/export/fileName";
import { withoutMoney, type ExportTable } from "@/lib/export/table";
import { xlsxBlob } from "@/lib/export/xlsx";
import { todayISO } from "@/lib/domain/dates";
import { useCan } from "@/lib/store/usePermissions";
import { usePrintStore } from "@/lib/store/usePrintStore";
import { cn } from "@/lib/utils";

export type ExportFormat = "xlsx" | "csv" | "print";

export interface ExportScope {
  /** "Filtro atual", "Rebanho todo". */
  label: string;
  /** "190 animais · lote Matrizes com cria". */
  detail: string;
  /** What narrowed the list, in words, for the "Sobre" sheet and the print footer. */
  filters?: string[];
  build: () => ExportTable[];
}

interface ExportMenuProps {
  /** Name of the list: print title and file name, e.g. "Rebanho". */
  title: string;
  current: ExportScope;
  /** The whole list; offered only when it differs from `current`. */
  all?: ExportScope;
  /** Which columns go out, under the formats. */
  hint?: string;
  formats?: readonly ExportFormat[];
  /** Button label; "Exportar" by default. */
  label?: string;
  className?: string;
}

const ALL_FORMATS: readonly ExportFormat[] = ["xlsx", "csv", "print"];

export function ExportMenu({ title, current, all, hint, formats = ALL_FORMATS, label = "Exportar", className }: ExportMenuProps) {
  const [scopeKey, setScopeKey] = useState<"current" | "all">("current");
  const [busy, setBusy] = useState(false);
  const seeMoney = useCan("finance", "view");
  const context = useExportContext();
  const print = usePrintStore((s) => s.print);

  const scope = scopeKey === "all" && all ? all : current;

  function tables(): ExportTable[] {
    return scope.build().map((table) => withoutMoney(table, seeMoney));
  }

  async function run(format: ExportFormat) {
    const built = tables();
    const ctx = context(scope.filters);
    const fileName = (ext: string) => exportFileName(title, ctx.farmName, todayISO(), ext);
    if (format === "print") {
      print({ title, subtitle: scope.detail, tables: built, context: ctx });
      return;
    }
    if (format === "csv") {
      downloadBlob(csvBlob(built[0]), fileName("csv"));
      return;
    }
    setBusy(true);
    try {
      downloadBlob(await xlsxBlob(built, ctx), fileName("xlsx"));
    } catch {
      toast.error("Não foi possível gerar a planilha. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={busy} className={cn("h-11 md:h-8", className)}>
          <Download aria-hidden />
          {label}
          <ChevronDown aria-hidden className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[min(20rem,calc(100vw-2rem))] p-1">
        {all ? (
          <>
            <p className="px-2 pt-1.5 pb-0.5 text-[11px] font-medium tracking-wide text-ink-soft uppercase">
              O que exportar
            </p>
            <DropdownMenuPrimitive.RadioGroup
              value={scopeKey}
              onValueChange={(value) => setScopeKey(value as "current" | "all")}
            >
              {(
                [
                  ["current", current],
                  ["all", all],
                ] as const
              ).map(([key, option]) => (
                <DropdownMenuPrimitive.RadioItem
                  key={key}
                  value={key}
                  // Picking the scope keeps the menu open for the format.
                  onSelect={(event) => event.preventDefault()}
                  className="flex min-h-11 cursor-default items-start gap-2.5 rounded-md p-2 outline-none select-none focus:bg-surface data-[state=checked]:bg-surface"
                >
                  <span
                    aria-hidden
                    className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-ink-soft/60"
                  >
                    <DropdownMenuPrimitive.ItemIndicator>
                      <span className="block size-2 rounded-full bg-brand" />
                    </DropdownMenuPrimitive.ItemIndicator>
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-ink">{option.label}</span>
                    <span className="block text-xs text-ink-soft">{option.detail}</span>
                  </span>
                </DropdownMenuPrimitive.RadioItem>
              ))}
            </DropdownMenuPrimitive.RadioGroup>
            <DropdownMenuSeparator />
            <p className="px-2 pt-1 pb-0.5 text-[11px] font-medium tracking-wide text-ink-soft uppercase">Formato</p>
          </>
        ) : null}
        {formats.includes("xlsx") ? (
          <FormatItem icon={FileSpreadsheet} title="Planilha Excel" detail=".xlsx · Excel, Google Planilhas, LibreOffice" onSelect={() => void run("xlsx")} />
        ) : null}
        {formats.includes("csv") ? (
          <FormatItem icon={Sheet} title="CSV" detail=".csv · separado por ponto e vírgula" onSelect={() => void run("csv")} />
        ) : null}
        {formats.includes("print") ? (
          <FormatItem icon={Printer} title="Imprimir ou salvar PDF" detail="Folha A4 com o cabeçalho da fazenda" onSelect={() => void run("print")} />
        ) : null}
        {hint ? (
          <>
            <DropdownMenuSeparator />
            <p className="px-2 pt-1 pb-2 text-xs text-ink-soft">{hint}</p>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FormatItem({
  icon: Icon,
  title,
  detail,
  onSelect,
}: {
  icon: typeof Printer;
  title: string;
  detail: string;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} className="items-center py-1.5 [&_svg]:text-brand">
      <Icon aria-hidden className="size-[18px]!" />
      <span>
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-ink-soft">{detail}</span>
      </span>
    </DropdownMenuItem>
  );
}
