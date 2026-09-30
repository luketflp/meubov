/**
 * CSV extratos: every bank writes its own columns, so the conta keeps a
 * mapping (which column is Data, Descrição, Valor or Entrada + Saída, the
 * delimiter, how many lines to skip). `guessCsvMapping` proposes one from the
 * first lines; `parseCsv` reads the file with it. Pure.
 */
import type { CsvMapping } from "@/lib/types";
import {
  isoDate,
  lineHashes,
  linesPeriod,
  parseAmountText,
  type ParseResult,
  type ParsedLine,
} from "@/lib/domain/statements/common";

/** The file's rows split into cells; quoted cells may hold the delimiter and "" for a quote. */
export function csvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  for (const raw of text.split(/\r?\n/)) {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (quoted) {
        if (ch === '"' && raw[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') {
          quoted = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === delimiter) {
        cells.push(cell.trim());
        cell = "";
      } else {
        cell += ch;
      }
    }
    cells.push(cell.trim());
    rows.push(cells);
  }
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  return rows;
}

/** "23/09/2026", "23-09-26" (dmy) or "2026-09-23" (ymd). */
function csvDate(text: string, format: CsvMapping["dateFormat"]): string | null {
  // "5/9/2026 10:30": the time after the date is dropped.
  const t = text.trim().split(/\s+/)[0];
  if (format === "ymd") {
    const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(t);
    return m ? isoDate(m[1], m[2], m[3]) : null;
  }
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (!m) return null;
  return isoDate(m[3].length === 2 ? `20${m[3]}` : m[3], m[2], m[1]);
}

/** Lower case without accents. */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** The bank's own saldo rows: "Saldo anterior", "S A L D O", "Saldo do dia" — not "SALDO APLIC AUT". */
const SALDO_ROW = /^s\s?a\s?l\s?d\s?o(\s+(anterior|do dia|final|atual|disponivel))?(\s+(em\s+)?[\d/.-]+)?$/;

/**
 * Reads the file with the mapping. Blank rows and the bank's own saldo rows
 * ("Saldo anterior", "S A L D O") are left out. Rows are counted from 1 as
 * in the file, header included.
 */
export function parseCsv(text: string, mapping: CsvMapping): ParseResult {
  const rows = csvRows(text, mapping.delimiter);
  const lines: Omit<ParsedLine, "externalId">[] = [];
  for (let i = mapping.skipRows; i < rows.length; i++) {
    const cells = rows[i];
    const row = i + 1;
    if (cells.every((c) => c === "")) continue;
    const description = cells[mapping.descriptionColumn] ?? "";
    if (SALDO_ROW.test(fold(description).trim())) continue;
    const split = mapping.amountColumn === undefined;
    const cell = (column: number | undefined) => (column === undefined ? "" : (cells[column] ?? ""));
    // A split row with neither entrada nor saída moves nothing (a saldo or a note).
    if (split && cell(mapping.inColumn) === "" && cell(mapping.outColumn) === "") continue;
    const date = csvDate(cells[mapping.dateColumn] ?? "", mapping.dateFormat);
    if (date === null) return { ok: false, error: `bad_date:${row}` };
    let amountBrl: number | null;
    if (!split) {
      amountBrl = parseAmountText(cell(mapping.amountColumn), mapping.decimal);
    } else {
      const read = (column: number | undefined) =>
        cell(column) === "" ? 0 : parseAmountText(cell(column), mapping.decimal);
      const entrada = read(mapping.inColumn);
      const saida = read(mapping.outColumn);
      amountBrl = entrada === null || saida === null ? null : Math.abs(entrada) - Math.abs(saida);
    }
    if (amountBrl === null) return { ok: false, error: `bad_amount:${row}` };
    lines.push({ date, description, amountBrl: Math.round(amountBrl * 100) / 100 });
  }
  if (lines.length === 0) return { ok: false, error: "no_lines" };
  const hashes = lineHashes(lines);
  const parsed = lines.map((line, i) => ({ ...line, externalId: hashes[i] }));
  return { ok: true, statement: { lines: parsed, period: linesPeriod(parsed) } };
}

/**
 * A first mapping from the file itself: the delimiter that splits the first
 * lines most evenly, the header rows before the first date, the date and value
 * columns by what they hold and the widest text as the description. The
 * mapping step shows it for the user to correct.
 */
export function guessCsvMapping(text: string): CsvMapping {
  const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
  const delimiter =
    [";", ",", "\t"]
      .map((d) => ({ d, n: csvRows(sample, d).filter((r) => r.length > 2).length }))
      .sort((a, b) => b.n - a.n)[0].d;
  const rows = csvRows(text, delimiter).slice(0, 20);
  const dateFormat: CsvMapping["dateFormat"] = rows.some((r) => r.some((c) => csvDate(c, "ymd"))) ? "ymd" : "dmy";
  const skipRows = Math.max(
    0,
    rows.findIndex((r) => r.some((c) => csvDate(c, dateFormat) !== null))
  );
  const data = rows.slice(skipRows).filter((r) => r.some((c) => c !== ""));
  const width = Math.max(0, ...data.map((r) => r.length));
  const columns = Array.from({ length: width }, (_, i) => data.map((r) => r[i] ?? ""));
  const decimal: CsvMapping["decimal"] = columns.some((col) => col.some((c) => /\d,\d{2}$/.test(c))) ? "," : ".";
  const dateColumn = Math.max(0, columns.findIndex((col) => col.every((c) => csvDate(c, dateFormat) !== null)));
  // Money has centavos: a column of document numbers parses too, but never ends in ",50".
  const amountColumns = columns
    .map((col, i) => ({
      i,
      ok:
        col.every((c) => c === "" || parseAmountText(c, decimal) !== null) &&
        col.some((c) => /[.,]\d{2}\)?-?$/.test(c)),
    }))
    .filter((c) => c.ok && c.i !== dateColumn)
    .map((c) => c.i);
  const textColumns = columns
    .map((col, i) => ({ i, len: col.reduce((sum, c) => sum + c.length, 0) }))
    .filter((c) => c.i !== dateColumn && !amountColumns.includes(c.i))
    .sort((a, b) => b.len - a.len);
  return {
    delimiter,
    dateColumn,
    descriptionColumn: textColumns[0]?.i ?? 1,
    amountColumn: amountColumns[0] ?? 2,
    dateFormat,
    decimal,
    skipRows,
  };
}
