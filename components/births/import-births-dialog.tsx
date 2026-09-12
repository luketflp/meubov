"use client";

/**
 * "Importar nascimentos": upload the maternidade caderno (.csv/.xlsx), check
 * each line in a preview, then import them. Every line is the same write as
 * "Registrar nascimento" — the parto on the dam, the calf in the herd, its
 * birth weight — plus a baixa when the caderno says the calf died.
 *
 * Reading and matching live in `lib/domain/birthImport` (pure); SheetJS loads
 * on demand. The server re-checks lots, dams and brincos in one transaction.
 */
import { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileUp, Upload } from "lucide-react";
import { useHerdStore, type ImportBirthsSummary } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { todayISO } from "@/lib/domain/dates";
import {
  birthImportPayloads,
  buildBirthImportRows,
  buildBirthTemplateCsv,
  formatEarTagList,
  mergeSheetCells,
  summarizeBirthImport,
  type LotPicks,
} from "@/lib/domain/birthImport";
import { currentPlacementForLot, currentlyPlacedLots } from "@/lib/store/selectors";
import { BirthImportLots, type LotOption } from "@/components/births/import-births-lots";
import { BirthImportPreview } from "@/components/births/import-births-preview";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** How many lines the preview renders (every ready line is still imported). */
const MAX_PREVIEW_ROWS = 200;

type Step = "pick" | "preview" | "done";

interface Sheet {
  name: string;
  matrix: unknown[][];
}

/** The server's summary plus the lines the preview already knew existed. */
type DoneSummary = ImportBirthsSummary & { skippedLines: number };

const DESCRIPTION: Record<Step, string> = {
  pick: "Envie o caderno da maternidade (.csv ou .xlsx), uma linha por bezerro. Cada linha registra o parto na matriz e cadastra o bezerro no rebanho.",
  preview: "Confira as linhas antes de importar. Nada é gravado até você confirmar.",
  done: "Importação concluída.",
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const listFormat = new Intl.ListFormat("pt-BR", { type: "conjunction" });

export function ImportBirthsDialog() {
  const animals = useHerdStore((s) => s.animals);
  const breeds = useHerdStore((s) => s.breeds);
  const lots = useHerdStore((s) => s.lots);
  const invernadas = useHerdStore((s) => s.invernadas);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const importBirths = useHerdStore((s) => s.importBirths);
  const { addToast } = useToast();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("pick");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [picks, setPicks] = useState<LotPicks>({});
  const [readError, setReadError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DoneSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const placedLots = useMemo(
    () => currentlyPlacedLots(lots, lotPlacements),
    [lots, lotPlacements]
  );
  const lotOptions = useMemo<LotOption[]>(() => {
    const codeById = new Map(invernadas.map((invernada) => [invernada.id, invernada.code]));
    return placedLots.map((lot) => {
      const placement = currentPlacementForLot(lot.id, lotPlacements);
      const code = placement ? codeById.get(placement.invernadaId) : undefined;
      return { id: lot.id, label: `${lot.name} · Inv. ${code ?? "—"}` };
    });
  }, [placedLots, invernadas, lotPlacements]);

  const result = useMemo(() => {
    const sheet = sheets[sheetIndex];
    if (!sheet) return null;
    return buildBirthImportRows(sheet.matrix, {
      animals,
      breeds,
      lots: placedLots,
      todayIso: todayISO(),
    });
  }, [sheets, sheetIndex, animals, breeds, placedLots]);
  const counts = result && !result.headerError ? summarizeBirthImport(result, picks) : null;

  function reset() {
    setStep("pick");
    setBusy(false);
    setFileName("");
    setSheets([]);
    setSheetIndex(0);
    setPicks({});
    setReadError(null);
    setSummary(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onOpenChange(next: boolean) {
    if (next) reset();
    setOpen(next);
  }

  function downloadTemplate() {
    const blob = new Blob([buildBirthTemplateCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "modelo-nascimentos.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Defer the revoke so the browser has started the download first.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    // Clear the input now so picking the SAME file again still fires onChange.
    if (inputRef.current) inputRef.current.value = "";
    setBusy(true);
    setReadError(null);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const read = workbook.SheetNames.map((name) => {
        const sheet = workbook.Sheets[name];
        const options = { header: 1, defval: "", blankrows: false } as const;
        const raw = XLSX.utils.sheet_to_json(sheet, { ...options, raw: true }) as unknown[][];
        const formatted = XLSX.utils.sheet_to_json(sheet, { ...options, raw: false }) as unknown[][];
        return { name, matrix: mergeSheetCells(raw, formatted) };
      });
      setSheets(read);
      setSheetIndex(0);
      setPicks({});
      setStep("preview");
    } catch {
      setReadError("Não foi possível ler o arquivo. Envie um .csv ou .xlsx válido.");
    } finally {
      setBusy(false);
    }
  }

  function onSheetChange(value: string) {
    setSheetIndex(Number(value));
    setPicks({});
  }

  async function onConfirm() {
    if (!result || !counts) return;
    const payloads = birthImportPayloads(result, picks);
    if (payloads.length === 0) return;
    const skippedLines = counts.duplicate;
    setBusy(true);
    try {
      const outcome = await importBirths(payloads);
      setSummary({ ...outcome, skippedLines: skippedLines + outcome.skipped.length });
      setStep("done");
      addToast({
        messageType: "success",
        text: plural(outcome.imported.length, "bezerro importado", "bezerros importados"),
      });
    } catch {
      // importBirths already surfaces an error toast on failure.
    } finally {
      setBusy(false);
    }
  }

  const blocked = !counts || counts.ready === 0 || counts.unpickedLots.length > 0;
  const previewRows = result?.rows.slice(0, MAX_PREVIEW_ROWS) ?? [];
  const hidden = (result?.rows.length ?? 0) - previewRows.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-11">
          <Upload aria-hidden />
          Importar nascimentos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar nascimentos</DialogTitle>
          <DialogDescription>{DESCRIPTION[step]}</DialogDescription>
        </DialogHeader>

        {step === "pick" ? (
          <div className="grid gap-4">
            <div className="grid gap-2 rounded-lg border border-hairline bg-panel p-4 text-sm">
              <p className="font-medium">Colunas esperadas</p>
              <p className="text-pretty text-ink-soft">
                brinco da mãe, brinco do bezerro, sexo, raça, peso (kg, opcional), data do
                parto (DD/MM/AAAA), lote. Uma coluna a mais com “morreu” registra a baixa do
                bezerro.
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
              htmlFor="import-births-file"
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
                id="import-births-file"
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
          <div className="grid min-w-0 gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-soft">
                  <FileSpreadsheet aria-hidden className="size-[18px] text-brand" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{fileName}</p>
                  {counts ? (
                    <p className="text-xs text-ink-soft">
                      {plural(counts.total, "linha", "linhas")} ·{" "}
                      <span className="font-medium text-ink">{counts.ready}</span>{" "}
                      {counts.ready === 1 ? "pronta" : "prontas"} ·{" "}
                      <span className="font-medium text-ink">{counts.duplicate}</span>{" "}
                      {counts.duplicate === 1 ? "já existe" : "já existem"} ·{" "}
                      <span className="font-medium text-ink">{counts.error}</span> com erro
                    </p>
                  ) : null}
                </div>
              </div>
              {sheets.length > 1 ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-soft">Aba</span>
                  <Select value={String(sheetIndex)} onValueChange={onSheetChange}>
                    <SelectTrigger aria-label="Aba da planilha" className="min-h-11 w-full sm:min-h-8 sm:w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sheets.map((sheet, index) => (
                        <SelectItem key={sheet.name} value={String(index)}>
                          {sheet.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            {result.headerError ? (
              <div className="grid gap-2.5 rounded-lg border border-overdue/40 bg-overdue/5 p-3 text-sm text-overdue">
                <p>{result.headerError}</p>
                {result.headers.length > 0 ? (
                  <div className="grid gap-1.5">
                    <p className="text-xs text-ink-soft">Cabeçalho lido no arquivo</p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.headers.map((header, index) => (
                        <span
                          key={`${header}-${index}`}
                          className="inline-flex h-6 items-center rounded-md border border-hairline bg-surface px-2 font-mono text-xs text-ink"
                        >
                          {header}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-ink-soft">
                      Renomeie as colunas na planilha e envie de novo.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                {counts && (counts.withoutDam > 0 || counts.deaths > 0 || result.newBreeds.length > 0) ? (
                  <p className="-mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-ink-soft">
                    {counts.withoutDam > 0 ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden className="size-1.5 rounded-full bg-attention" />
                        {plural(counts.withoutDam, "bezerro sem mãe vinculada", "bezerros sem mãe vinculada")}
                      </span>
                    ) : null}
                    {counts.deaths > 0 ? (
                      <span>{plural(counts.deaths, "baixa por morte", "baixas por morte")}</span>
                    ) : null}
                    {result.newBreeds.length > 0 ? (
                      <span>
                        {result.newBreeds.length === 1 ? "Raça nova" : "Raças novas"}:{" "}
                        <span className="text-ink">{listFormat.format(result.newBreeds)}</span>,{" "}
                        {result.newBreeds.length === 1 ? "criada" : "criadas"} ao importar
                      </span>
                    ) : null}
                  </p>
                ) : null}

                <BirthImportLots
                  values={result.lotValues}
                  picks={picks}
                  lots={lotOptions}
                  onPick={(key, lotId) => setPicks((current) => ({ ...current, [key]: lotId }))}
                />

                <BirthImportPreview rows={previewRows} />
                {hidden > 0 ? (
                  <p className="text-xs text-ink-soft">
                    Mostrando as primeiras {MAX_PREVIEW_ROWS} linhas de {result.rows.length}.
                    Todas as linhas válidas serão importadas.
                  </p>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {step === "done" && summary ? (
          <div className="grid gap-2 rounded-lg border border-hairline bg-panel p-4 text-sm">
            <p className="text-base font-medium">
              {plural(summary.imported.length, "bezerro importado", "bezerros importados")}
            </p>
            {summary.calvings > 0 ? (
              <p className="text-ink-soft">
                {plural(summary.calvings, "parto registrado", "partos registrados")} nas matrizes.
              </p>
            ) : null}
            {summary.withoutDam.length > 0 ? (
              <p className="text-ink-soft">
                {plural(summary.withoutDam.length, "bezerro entrou", "bezerros entraram")} sem mãe
                vinculada: {formatEarTagList(summary.withoutDam)}.
              </p>
            ) : null}
            {summary.deaths.length > 0 ? (
              <p className="text-ink-soft">
                {plural(summary.deaths.length, "baixa", "baixas")} por morte:{" "}
                {formatEarTagList(summary.deaths)}.
              </p>
            ) : null}
            {summary.skippedLines > 0 ? (
              <p className="text-ink-soft">
                {plural(summary.skippedLines, "linha ignorada", "linhas ignoradas")} (brinco já
                existia).
              </p>
            ) : null}
            {summary.createdBreeds.length > 0 ? (
              <p className="text-ink-soft">
                {summary.createdBreeds.length === 1 ? "Raça criada" : "Raças criadas"}:{" "}
                {listFormat.format(summary.createdBreeds)}.
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
                disabled={busy || blocked}
              >
                {busy
                  ? "Importando…"
                  : counts
                    ? `Importar ${plural(counts.ready, "bezerro", "bezerros")}`
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
