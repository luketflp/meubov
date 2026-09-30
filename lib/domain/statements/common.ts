/**
 * What an extrato parser answers, and the small helpers both parsers share:
 * the error codes, the amount and date readers, the CSV line hash and the
 * file's text decoding. Pure.
 */
import type { StatementFormat } from "@/lib/types";

export interface ParsedLine {
  date: string;
  description: string;
  /** Signed: + entrada, − saída. */
  amountBrl: number;
  /** OFX FITID, or a hash of the CSV line and its occurrence. */
  externalId: string;
}

export interface ParsedStatement {
  lines: ParsedLine[];
  /** OFX LEDGERBAL. */
  bankBalance?: { amountBrl: number; date: string };
  period: { from: string; to: string };
}

/** `not_ofx`, `no_lines`, `bad_date:<row>`, `bad_amount:<row>`. */
export type ParseResult = { ok: true; statement: ParsedStatement } | { ok: false; error: string };

/** Largest extrato file accepted, in bytes. */
export const MAX_STATEMENT_BYTES = 2 * 1024 * 1024;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" when the parts name a real day, else null. */
export function isoDate(year: string, month: string, day: string): string | null {
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const match = ISO.exec(iso);
  if (!match) return null;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return d.toISOString().slice(0, 10) === iso ? iso : null;
}

/**
 * A money text as a number: "1.234,56" with `decimal` ",", "-1234.56" with
 * ".", "R$ 64,90", "64,90-" or "(64,90)" for a negative. Null when unreadable.
 */
export function parseAmountText(text: string, decimal: "," | "."): number | null {
  let t = text.replace(/R\$|\s| /g, "");
  let negative = false;
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1);
  }
  if (t.endsWith("-")) {
    negative = true;
    t = t.slice(0, -1);
  }
  if (t.startsWith("-")) {
    negative = !negative;
    t = t.slice(1);
  } else if (t.startsWith("+")) {
    t = t.slice(1);
  }
  t = decimal === "," ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const value = Math.round(Number(t) * 100) / 100;
  return negative ? -value : value;
}

/** cyrb53: a 53-bit string hash, stable across runs, as base 36. */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * The `externalId` of a line without a bank id: its date, description and
 * value, plus how many identical lines came before it in the same file, so
 * two real R$ 50 tarifas on one day stay two lines.
 */
export function lineHashes(lines: Omit<ParsedLine, "externalId">[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const key = `${line.date}|${line.description.trim().toLowerCase()}|${line.amountBrl.toFixed(2)}`;
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    return `h:${hashText(`${key}|${occurrence}`)}`;
  });
}

/** First and last date of the lines. */
export function linesPeriod(lines: { date: string }[]): { from: string; to: string } {
  const dates = lines.map((l) => l.date).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

/**
 * The file's text: UTF-8 when it is valid UTF-8, else Windows-1252 (what
 * Brazilian banks write when they write Latin-1).
 */
export function decodeBankFile(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return text.replace(/^﻿/, "");
}

/** OFX by extension (.ofx, .qfx) or by an <OFX> tag; anything else is CSV. */
export function statementFormat(fileName: string, text: string): StatementFormat {
  if (/\.(ofx|qfx)$/i.test(fileName)) return "ofx";
  if (/\.(csv|txt)$/i.test(fileName)) return "csv";
  return /<OFX>/i.test(text) ? "ofx" : "csv";
}

/** pt-BR message for a parser error code ("bad_date:12" → "Data ilegível na linha 12"). */
export function statementErrorMessage(code: string): string {
  const [kind, row] = code.split(":");
  if (kind === "not_ofx") return "O arquivo não é um extrato OFX";
  if (kind === "no_lines") return "O extrato não tem lançamentos";
  if (kind === "bad_date") return `Data ilegível na linha ${row}`;
  if (kind === "bad_amount") return `Valor ilegível na linha ${row}`;
  return "Não foi possível ler o extrato";
}
