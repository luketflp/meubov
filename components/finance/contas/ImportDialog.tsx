"use client";

/**
 * "Importar extrato": an OFX or CSV file from the bank into a conta corrente.
 * An OFX goes straight in. A CSV asks once which column is what (the first
 * five lines as a table, a select per role, the delimiter and how many lines
 * to skip) and the conta keeps the answer; later imports show the first lines
 * read with it to confirm. The result says how many lines are new and leads
 * to the conciliação.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import type { BankAccount, CsvMapping } from "@/lib/types";
import {
  MAX_STATEMENT_BYTES,
  decodeBankFile,
  statementErrorMessage,
  statementFormat,
} from "@/lib/domain/statements/common";
import { csvRows, guessCsvMapping, parseCsv } from "@/lib/domain/statements/csv";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const DELIMITERS: readonly { value: string; label: string }[] = [
  { value: ";", label: "ponto e vírgula ( ; )" },
  { value: ",", label: "vírgula ( , )" },
  { value: "\t", label: "tabulação" },
];

type Step =
  | { kind: "file" }
  | { kind: "map"; fileName: string; text: string; mapping: CsvMapping }
  | { kind: "confirm"; fileName: string; text: string; mapping: CsvMapping }
  | { kind: "done"; importId: string; newLines: number; skipped: number };

export function ImportDialog({
  account,
  onOpenChange,
}: {
  account: BankAccount;
  onOpenChange(open: boolean): void;
}) {
  const router = useRouter();
  const importStatement = useHerdStore((s) => s.importStatement);
  const [step, setStep] = useState<Step>({ kind: "file" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(fileName: string, text: string, mapping?: CsvMapping) {
    setBusy(true);
    setError(null);
    try {
      const result = await importStatement(account.id, { fileName, content: text, mapping });
      if ("error" in result) {
        if (result.error === "mapping_required") {
          setStep({ kind: "map", fileName, text, mapping: guessCsvMapping(text) });
        } else {
          setError(result.error === "nothing_new" ? "Nada novo neste extrato" : statementErrorMessage(result.error));
        }
        return;
      }
      setStep({ kind: "done", importId: result.import.id, newLines: result.newLines, skipped: result.skipped });
    } catch {
      // apiFail already toasted
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_STATEMENT_BYTES) {
      setError("O arquivo passa de 2 MB.");
      return;
    }
    const text = decodeBankFile(new Uint8Array(await file.arrayBuffer()));
    if (statementFormat(file.name, text) === "ofx") return send(file.name, text);
    setError(null);
    setStep(
      account.csvMapping
        ? { kind: "confirm", fileName: file.name, text, mapping: account.csvMapping }
        : { kind: "map", fileName: file.name, text, mapping: guessCsvMapping(text) }
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!busy) onOpenChange(open);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar extrato</DialogTitle>
          <DialogDescription>
            {account.name}
            {account.label ? ` ${account.label}` : ""} · arquivo OFX ou CSV do banco, até 2 MB
          </DialogDescription>
        </DialogHeader>

        {step.kind === "file" ? (
          <label
            className={cn(
              "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-hairline bg-surface px-4 py-6 text-center text-sm text-ink",
              busy && "pointer-events-none opacity-60"
            )}
          >
            <Upload className="size-5 text-ink-soft" aria-hidden />
            <span className="font-medium">{busy ? "Importando…" : "Escolher arquivo (OFX, CSV)"}</span>
            <span className="text-xs text-ink-soft">o extrato baixado do internet banking</span>
            <input
              type="file"
              accept=".ofx,.qfx,.csv,.txt"
              className="sr-only"
              aria-label="Arquivo do extrato"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // The same file picked again (after a refusal) fires onChange again.
                e.target.value = "";
                void onFile(file);
              }}
            />
          </label>
        ) : null}

        {step.kind === "map" ? (
          <MappingStep
            text={step.text}
            mapping={step.mapping}
            onChange={(mapping) => setStep({ ...step, mapping })}
          />
        ) : null}

        {step.kind === "confirm" ? <ConfirmStep text={step.text} mapping={step.mapping} /> : null}

        {step.kind === "done" ? (
          <p className="rounded-lg bg-healthy-soft px-3 py-2.5 text-sm text-healthy">
            {formatNumber(step.newLines)} {step.newLines === 1 ? "linha nova" : "linhas novas"} ·{" "}
            {formatNumber(step.skipped)} {step.skipped === 1 ? "já importada" : "já importadas"}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-overdue">
            {error}
          </p>
        ) : null}

        <DialogFooter className="gap-2">
          {step.kind === "done" ? (
            <>
              <Button type="button" variant="outline" className="min-h-11 md:min-h-9" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
              <Button
                type="button"
                className="min-h-11 md:min-h-9"
                onClick={() => router.push(`/finance/contas/${account.id}/conciliar/${step.importId}`)}
              >
                Conciliar agora
              </Button>
            </>
          ) : step.kind === "file" ? (
            <Button type="button" variant="outline" className="min-h-11 md:min-h-9" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          ) : (
            <>
              {step.kind === "confirm" ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 md:min-h-9"
                  disabled={busy}
                  onClick={() => setStep({ ...step, kind: "map" })}
                >
                  Mudar colunas
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="min-h-11 md:min-h-9"
                disabled={busy}
                onClick={() => setStep({ kind: "file" })}
              >
                Voltar
              </Button>
              <Button
                type="button"
                className="min-h-11 md:min-h-9"
                disabled={busy}
                onClick={() => {
                  const parsed = parseCsv(step.text, step.mapping);
                  if (!parsed.ok) return setError(statementErrorMessage(parsed.error));
                  void send(step.fileName, step.text, step.kind === "map" ? step.mapping : undefined);
                }}
              >
                {busy ? "Importando…" : "Importar"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The CSV's first lines read with the mapping the conta keeps. */
function ConfirmStep({ text, mapping }: { text: string; mapping: CsvMapping }) {
  const parsed = parseCsv(text, mapping);
  if (!parsed.ok) {
    return <p className="text-sm text-overdue">{statementErrorMessage(parsed.error)} · confira as colunas.</p>;
  }
  return (
    <div className="grid gap-2">
      <p className="text-sm text-ink-soft">Primeiras linhas lidas com as colunas desta conta:</p>
      <ul className="divide-y divide-hairline rounded-lg border border-hairline">
        {parsed.statement.lines.slice(0, 5).map((line) => (
          <li key={line.externalId} className="grid grid-cols-[56px_minmax(0,1fr)_auto] gap-3 px-3 py-2 text-sm">
            <span className="font-mono text-xs text-ink-soft">{formatDate(line.date).slice(0, 5)}</span>
            <span className="truncate font-mono text-[13px]">{line.description}</span>
            <span className={cn("font-mono", line.amountBrl > 0 ? "text-healthy" : "text-ink")}>
              {formatCurrency(line.amountBrl)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Qual coluna é o quê": the first five lines after the skipped ones and a select per role. */
function MappingStep({
  text,
  mapping,
  onChange,
}: {
  text: string;
  mapping: CsvMapping;
  onChange(mapping: CsvMapping): void;
}) {
  const rows = csvRows(text, mapping.delimiter);
  const preview = rows.slice(mapping.skipRows, mapping.skipRows + 5);
  const width = Math.max(1, ...rows.slice(0, mapping.skipRows + 5).map((r) => r.length));
  const columns = Array.from({ length: width }, (_, i) => i);
  const split = mapping.amountColumn === undefined;
  const set = (patch: Partial<CsvMapping>) => onChange({ ...mapping, ...patch });

  const columnSelect = (id: string, label: string, value: number | undefined, pick: (column: number) => void) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value === undefined ? "" : String(value)} onValueChange={(v) => pick(Number(v))}>
        <SelectTrigger id={id} className="min-h-11 w-full md:min-h-9">
          <SelectValue placeholder="coluna" />
        </SelectTrigger>
        <SelectContent>
          {columns.map((c) => (
            <SelectItem key={c} value={String(c)}>
              Coluna {c + 1}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="grid gap-4">
      <p className="text-sm text-ink-soft">
        Diga uma vez qual coluna é o quê; a conta guarda para os próximos extratos.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="csv-delimiter">Separador</Label>
          <Select value={mapping.delimiter} onValueChange={(delimiter) => set({ delimiter })}>
            <SelectTrigger id="csv-delimiter" className="min-h-11 w-full md:min-h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DELIMITERS.map((d) => (
                <SelectItem key={d.label} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="csv-skip">Pular linhas do início</Label>
          <Input
            id="csv-skip"
            type="number"
            min={0}
            max={50}
            value={mapping.skipRows}
            onChange={(e) => set({ skipRows: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })}
            className="min-h-11 font-mono md:min-h-9"
          />
        </div>
        {columnSelect("csv-date", "Data", mapping.dateColumn, (dateColumn) => set({ dateColumn }))}
        {columnSelect("csv-description", "Descrição", mapping.descriptionColumn, (descriptionColumn) =>
          set({ descriptionColumn })
        )}
      </div>
      <div role="radiogroup" aria-label="Valor" className="flex flex-wrap gap-4 text-sm">
        <label className="flex min-h-11 items-center gap-2 md:min-h-0">
          <input
            type="radio"
            name="csv-amount-mode"
            checked={!split}
            onChange={() => set({ amountColumn: mapping.inColumn ?? 0, inColumn: undefined, outColumn: undefined })}
            className="accent-brand"
          />
          Valor numa coluna (saída negativa)
        </label>
        <label className="flex min-h-11 items-center gap-2 md:min-h-0">
          <input
            type="radio"
            name="csv-amount-mode"
            checked={split}
            onChange={() => set({ inColumn: mapping.amountColumn ?? 0, outColumn: undefined, amountColumn: undefined })}
            className="accent-brand"
          />
          Entrada e Saída separadas
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {split ? (
          <>
            {columnSelect("csv-in", "Entrada", mapping.inColumn, (inColumn) => set({ inColumn }))}
            {columnSelect("csv-out", "Saída", mapping.outColumn, (outColumn) => set({ outColumn }))}
          </>
        ) : (
          columnSelect("csv-amount", "Valor", mapping.amountColumn, (amountColumn) => set({ amountColumn }))
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full border-collapse text-left text-xs">
          <caption className="sr-only">Primeiras linhas do arquivo</caption>
          <thead>
            <tr className="bg-surface">
              {columns.map((c) => (
                <th key={c} scope="col" className="px-2 py-1.5 font-medium whitespace-nowrap text-ink-soft">
                  Coluna {c + 1}
                  {c === mapping.dateColumn
                    ? " · Data"
                    : c === mapping.descriptionColumn
                      ? " · Descrição"
                      : c === mapping.amountColumn
                        ? " · Valor"
                        : c === mapping.inColumn
                          ? " · Entrada"
                          : c === mapping.outColumn
                            ? " · Saída"
                            : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, i) => (
              <tr key={i} className="border-t border-hairline">
                {columns.map((c) => (
                  <td key={c} className="max-w-48 truncate px-2 py-1.5 font-mono whitespace-nowrap">
                    {row[c] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
