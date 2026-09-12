"use client";

/**
 * The lines of a caderno before they are imported: a table on desktop, one
 * card per bezerro on the phone. Each line says what the import will do with
 * it — parto and calf, calf only, calf and baixa — or why it stays out.
 */
import {
  BIRTH_FIELD_LABEL,
  damNote,
  type BirthImportField,
  type BirthImportRow,
} from "@/lib/domain/birthImport";
import { formatDate } from "@/lib/domain/dates";
import { SEX_LABEL } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function dateLabel(row: BirthImportRow): string {
  if (row.parsed) return formatDate(row.parsed.date);
  return row.cells.date || "—";
}

/** Situação of one line: its badges and the notes under them. */
function StatusCell({ row }: { row: BirthImportRow }) {
  if (row.status === "duplicate") {
    return (
      <Badge variant="outline">
        {row.duplicateReason === "in_file" ? "Repetido no arquivo" : "Já existe"}
      </Badge>
    );
  }
  if (row.status === "error") {
    const errors = Object.entries(row.errors) as [BirthImportField, string][];
    return (
      <div className="flex flex-col items-start gap-0.5">
        <Badge variant="destructive">Erro</Badge>
        <ul className="space-y-0.5 text-xs text-overdue">
          {errors.map(([field, message]) => (
            <li key={field}>
              {BIRTH_FIELD_LABEL[field]}: {message}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const note = damNote(row.dam);
  const died = row.deathNote !== undefined;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <div className="flex flex-wrap gap-1">
        {note ? (
          <Badge className="bg-attention-soft text-attention">Sem mãe</Badge>
        ) : (
          <Badge variant="secondary">Válido</Badge>
        )}
        {died ? (
          <Badge variant="outline" className="text-ink-soft">
            Morreu
          </Badge>
        ) : null}
      </div>
      {note ? <p className="text-xs text-pretty text-attention">{note}</p> : null}
      {died && row.parsed ? (
        <p className="text-xs text-ink-soft">
          Baixa por morte em {formatDate(row.parsed.date)}.
        </p>
      ) : null}
    </div>
  );
}

interface BirthImportPreviewProps {
  /** The lines to render (the dialog caps how many). */
  rows: BirthImportRow[];
}

export function BirthImportPreview({ rows }: BirthImportPreviewProps) {
  return (
    <>
      {/* Desktop: table */}
      <div className="hidden max-h-[45dvh] overflow-auto rounded-lg border border-hairline md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Mãe</TableHead>
              <TableHead>Bezerro</TableHead>
              <TableHead>Sexo</TableHead>
              <TableHead>Raça</TableHead>
              <TableHead>Peso</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.line} data-status={row.status} className="align-top">
                <TableCell className="font-mono text-xs text-ink-soft">{row.line}</TableCell>
                <TableCell
                  className={cn(
                    "font-mono",
                    row.dam.kind === "matched" ? "text-ink" : "text-attention"
                  )}
                >
                  {row.cells.damEarTag || "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "font-mono font-medium",
                    row.errors.calfEarTag ? "text-overdue" : "text-ink"
                  )}
                >
                  {row.cells.calfEarTag || "—"}
                </TableCell>
                <TableCell className={cn("font-mono", row.errors.sex && "text-overdue")}>
                  {row.cells.sex || "—"}
                </TableCell>
                <TableCell className={cn(row.errors.breed && "text-overdue")}>
                  {row.breed || row.cells.breed || "—"}
                </TableCell>
                <TableCell className={cn("font-mono", row.errors.weightKg && "text-overdue")}>
                  {row.cells.weightKg || "—"}
                </TableCell>
                <TableCell className={cn("font-mono", row.errors.date && "text-overdue")}>
                  {dateLabel(row)}
                </TableCell>
                <TableCell
                  className={cn("font-mono", row.errors.lot ? "text-overdue" : "text-ink-soft")}
                >
                  {row.cells.lot || "—"}
                </TableCell>
                <TableCell className="min-w-44 whitespace-normal">
                  <StatusCell row={row} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: one card per bezerro */}
      <ul className="max-h-[45dvh] divide-y divide-hairline overflow-auto rounded-lg border border-hairline bg-panel md:hidden">
        {rows.map((row) => {
          const sex = row.parsed ? SEX_LABEL[row.parsed.sex] : row.cells.sex;
          const weight = row.cells.weightKg ? `${row.cells.weightKg} kg` : "";
          const details = [sex, row.breed || row.cells.breed, weight].filter(Boolean).join(" · ");
          return (
            <li key={row.line} data-status={row.status} className="grid gap-1.5 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="font-mono text-sm font-medium text-ink">
                    {row.cells.calfEarTag || "—"}
                  </span>
                  <span className="truncate text-xs text-ink-soft">{details}</span>
                </div>
                <span className="shrink-0 font-mono text-xs text-ink-soft">{dateLabel(row)}</span>
              </div>
              <p className="text-xs text-ink-soft">
                Mãe{" "}
                <span
                  className={cn(
                    "font-mono",
                    row.dam.kind === "matched" ? "text-ink" : "text-attention"
                  )}
                >
                  {row.cells.damEarTag || "—"}
                </span>{" "}
                · lote <span className="font-mono">{row.cells.lot || "—"}</span> · linha{" "}
                {row.line}
              </p>
              <StatusCell row={row} />
            </li>
          );
        })}
      </ul>
    </>
  );
}
