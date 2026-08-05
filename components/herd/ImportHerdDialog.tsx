"use client";

/**
 * "Importar rebanho" dialog: upload a CSV/`.xlsx`, preview each row with its
 * pt-BR validation status, then bulk-import the valid ones. Parsing and
 * validation live in `lib/domain/herdImport` (pure); SheetJS is loaded on demand
 * so its weight stays out of the main bundle. The server re-validates and is the
 * authority on duplicates and auto-created raças/lots.
 */
import { useRef, useState } from "react";
import { Download, FileUp, Upload } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { todayISO } from "@/lib/domain/dates";
import {
  buildImportRows,
  buildTemplateCsv,
  importablePayloads,
  FIELD_LABEL,
  type ImportField,
  type ImportParseResult,
  type ImportRow,
} from "@/lib/domain/herdImport";
import type { ImportSummary } from "@/lib/store/useHerdStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** How many preview rows to render (all valid rows are still imported). */
const MAX_PREVIEW_ROWS = 200;

/** Columns shown in the preview, in order. */
const PREVIEW_COLUMNS: ImportField[] = [
  "earTag",
  "category",
  "breed",
  "sex",
  "birthDate",
  "lot",
  "weightKg",
];

type Step = "pick" | "preview" | "done";

/** Status badge + short pt-BR note for one preview row. */
function RowStatusCell({ row }: { row: ImportRow }) {
  if (row.status === "ok") {
    return <Badge variant="secondary">Válido</Badge>;
  }
  if (row.status === "duplicate") {
    return (
      <Badge variant="outline">
        {row.duplicateReason === "in_file" ? "Repetido no arquivo" : "Já existe"}
      </Badge>
    );
  }
  const firstError = Object.values(row.errors)[0];
  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant="destructive">Erro</Badge>
      {firstError ? <span className="text-xs text-overdue">{firstError}</span> : null}
    </div>
  );
}

export function ImportHerdDialog() {
  const animals = useHerdStore((s) => s.animals);
  const customCategories = useHerdStore((s) => s.customCategories);
  const importHerd = useHerdStore((s) => s.importHerd);
  const { addToast } = useToast();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("pick");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportParseResult | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("pick");
    setBusy(false);
    setFileName("");
    setResult(null);
    setReadError(null);
    setSummary(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onOpenChange(next: boolean) {
    if (next) reset();
    setOpen(next);
  }

  function downloadTemplate() {
    const blob = new Blob([buildTemplateCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "modelo-rebanho.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Defer the revoke so the browser has started the download before the blob
    // URL is released.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    // Clear the input now so re-picking the SAME file still fires onChange
    // (e.g. to retry after a read error).
    if (inputRef.current) inputRef.current.value = "";
    setBusy(true);
    setReadError(null);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      const matrix = sheet
        ? (XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            raw: true,
            defval: "",
            blankrows: false,
          }) as unknown[][])
        : [];
      const parsed = buildImportRows(matrix, {
        customCategories,
        existingEarTags: animals.map((a) => a.earTag),
        todayIso: todayISO(),
      });
      setResult(parsed);
      setStep("preview");
    } catch {
      setReadError("Não foi possível ler o arquivo. Envie um .csv ou .xlsx válido.");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!result) return;
    const payloads = importablePayloads(result);
    if (payloads.length === 0) return;
    setBusy(true);
    try {
      const outcome = await importHerd(payloads);
      setSummary(outcome);
      setStep("done");
      addToast({
        messageType: "success",
        text: `${outcome.imported} ${outcome.imported === 1 ? "animal importado" : "animais importados"}`,
      });
    } catch {
      // importHerd already surfaces an error toast on failure.
    } finally {
      setBusy(false);
    }
  }

  const counts = result?.counts;
  const previewRows = result?.rows.slice(0, MAX_PREVIEW_ROWS) ?? [];
  const hidden = (result?.rows.length ?? 0) - previewRows.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-11">
          <Upload aria-hidden />
          Importar rebanho
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar rebanho</DialogTitle>
          <DialogDescription>
            Envie uma planilha (.csv ou .xlsx) com uma linha por animal. Raças e
            lotes novos são criados automaticamente; brincos já cadastrados são
            ignorados.
          </DialogDescription>
        </DialogHeader>

        {step === "pick" ? (
          <div className="grid gap-4">
            <div className="grid gap-2 rounded-lg border border-hairline bg-panel p-4 text-sm">
              <p className="font-medium">Colunas esperadas</p>
              <p className="text-ink-soft">
                brinco, categoria, raça, sexo (opcional quando a categoria já
                define), nascimento (DD/MM/AAAA), lote, peso (kg, opcional).
              </p>
              <button
                type="button"
                onClick={downloadTemplate}
                className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Download aria-hidden className="size-4" />
                Baixar modelo
              </button>
            </div>

            <label
              htmlFor="import-file"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-hairline bg-panel p-8 text-center hover:bg-muted/40"
            >
              <FileUp aria-hidden className="size-6 text-ink-soft" />
              <span className="text-sm font-medium">
                {busy ? "Lendo arquivo…" : "Escolher arquivo .csv ou .xlsx"}
              </span>
              {fileName && !busy ? (
                <span className="text-xs text-ink-soft">{fileName}</span>
              ) : null}
              <input
                ref={inputRef}
                id="import-file"
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                disabled={busy}
                onChange={(e) => onPickFile(e.target.files?.[0])}
              />
            </label>

            {readError ? <p className="text-sm text-overdue">{readError}</p> : null}
          </div>
        ) : null}

        {step === "preview" && result ? (
          <div className="grid gap-3">
            {result.headerError ? (
              <p className="rounded-lg border border-overdue/40 bg-overdue/5 p-3 text-sm text-overdue">
                {result.headerError}
              </p>
            ) : (
              <>
                {counts ? (
                  <p className="text-sm text-ink-soft">
                    <span className="font-medium text-ink">{counts.ok}</span> válidos ·{" "}
                    <span className="font-medium text-ink">{counts.duplicate}</span> já
                    existem ·{" "}
                    <span className="font-medium text-ink">{counts.error}</span> com erro
                  </p>
                ) : null}
                <div className="max-h-[45dvh] overflow-auto rounded-lg border border-hairline">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        {PREVIEW_COLUMNS.map((field) => (
                          <TableHead key={field}>{FIELD_LABEL[field]}</TableHead>
                        ))}
                        <TableHead>Situação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row) => (
                        <TableRow key={row.line} data-status={row.status}>
                          <TableCell className="text-ink-soft">{row.line}</TableCell>
                          {PREVIEW_COLUMNS.map((field) => (
                            <TableCell
                              key={field}
                              className={row.errors[field] ? "text-overdue" : undefined}
                            >
                              {row.cells[field] || "—"}
                            </TableCell>
                          ))}
                          <TableCell>
                            <RowStatusCell row={row} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {hidden > 0 ? (
                  <p className="text-xs text-ink-soft">
                    Mostrando as primeiras {MAX_PREVIEW_ROWS} linhas de{" "}
                    {result.rows.length}. Todas as linhas válidas serão importadas.
                  </p>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {step === "done" && summary ? (
          <div className="grid gap-2 rounded-lg border border-hairline bg-panel p-4 text-sm">
            <p className="text-base font-medium">
              {summary.imported} {summary.imported === 1 ? "animal importado" : "animais importados"}
            </p>
            {summary.skipped > 0 ? (
              <p className="text-ink-soft">
                {summary.skipped} {summary.skipped === 1 ? "linha ignorada" : "linhas ignoradas"} (brinco já existia).
              </p>
            ) : null}
            {summary.createdBreeds.length > 0 ? (
              <p className="text-ink-soft">
                Raças criadas: {summary.createdBreeds.join(", ")}.
              </p>
            ) : null}
            {summary.createdLots.length > 0 ? (
              <p className="text-ink-soft">
                Lotes criados: {summary.createdLots.join(", ")}. Ajuste área e capim
                em Configurações.
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          {step === "preview" ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={reset}
                disabled={busy}
              >
                Trocar arquivo
              </Button>
              <Button
                type="button"
                className="min-h-11"
                onClick={onConfirm}
                disabled={busy || !counts || counts.ok === 0}
              >
                {busy
                  ? "Importando…"
                  : counts
                    ? `Importar ${counts.ok} ${counts.ok === 1 ? "animal" : "animais"}`
                    : "Importar"}
              </Button>
            </>
          ) : (
            <DialogClose asChild>
              <Button type="button" className="min-h-11">
                {step === "done" ? "Concluir" : "Fechar"}
              </Button>
            </DialogClose>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
