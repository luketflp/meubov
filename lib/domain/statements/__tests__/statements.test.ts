import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeBankFile,
  lineHashes,
  parseAmountText,
  statementErrorMessage,
  statementFormat,
} from "@/lib/domain/statements/common";
import { ofxAmount, parseOfx } from "@/lib/domain/statements/ofx";
import { csvRows, guessCsvMapping, parseCsv } from "@/lib/domain/statements/csv";
import type { CsvMapping } from "@/lib/types";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("parseOfx", () => {
  it("reads a 1.x SGML extrato (Sicredi-like): lines, FITIDs, LEDGERBAL and the window", () => {
    const result = parseOfx(fixture("sicredi-1x.ofx"));
    if (!result.ok) throw new Error(result.error);
    const { lines, bankBalance, period } = result.statement;
    expect(lines).toHaveLength(5);
    expect(lines[0]).toEqual({
      date: "2026-09-10",
      description: "PAGTO FOLHA SALARIOS",
      amountBrl: -18400,
      externalId: "f:202609100001",
    });
    expect(lines[2]).toMatchObject({ amountBrl: 148320, description: "PIX RECEBIDO FRIGORIFICO MINERVA" });
    // No MEMO: the NAME describes it.
    expect(lines[3]).toMatchObject({ description: "TARIFA PACOTE SERVICOS", amountBrl: -64.9 });
    expect(bankBalance).toEqual({ amountBrl: 84312.4, date: "2026-09-26" });
    expect(period).toEqual({ from: "2026-09-01", to: "2026-09-26" });
  });

  it("reads a 2.x XML extrato (BB-like) with comma decimals, entities and a repeated FITID", () => {
    const result = parseOfx(fixture("bb-2x.ofx"));
    if (!result.ok) throw new Error(result.error);
    const { lines, bankBalance, period } = result.statement;
    expect(lines.map((l) => [l.date, l.description, l.amountBrl, l.externalId])).toEqual([
      ["2026-09-25", "Cemig & Cia", -912.35, "f:20260925912"],
      ["2026-09-26", "PIX ENVIADO AGROVET UBERABA", -1280, "f:20260926001"],
      ["2026-09-26", "PIX ENVIADO AGROVET UBERABA", -1280, "f:20260926001:2"],
    ]);
    expect(bankBalance).toEqual({ amountBrl: 23108.15, date: "2026-09-30" });
    expect(period).toEqual({ from: "2026-09-15", to: "2026-09-30" });
  });

  it("takes the last of , and . as the decimal separator", () => {
    expect(ofxAmount("-1.234,56")).toBe(-1234.56);
    expect(ofxAmount("1,234.56")).toBe(1234.56);
    expect(ofxAmount("-64,90")).toBe(-64.9);
    expect(ofxAmount("1234.5")).toBe(1234.5);
  });

  it("answers codes for what it cannot read", () => {
    expect(parseOfx("Data;Valor\n01/09/2026;10,00")).toEqual({ ok: false, error: "not_ofx" });
    expect(parseOfx("<OFX><BANKTRANLIST></BANKTRANLIST></OFX>")).toEqual({ ok: false, error: "no_lines" });
    const twoLines = "<OFX><STMTTRN><DTPOSTED>20260901<TRNAMT>-1.00<FITID>1</STMTTRN><STMTTRN>";
    expect(parseOfx(`${twoLines}<DTPOSTED>20260231<TRNAMT>-1.00</STMTTRN></OFX>`)).toEqual({ ok: false, error: "bad_date:2" });
    expect(parseOfx(`${twoLines}<DTPOSTED>20260902<TRNAMT>abc</STMTTRN></OFX>`)).toEqual({ ok: false, error: "bad_amount:2" });
  });
});

const PTBR: CsvMapping = {
  delimiter: ";",
  dateColumn: 0,
  descriptionColumn: 1,
  amountColumn: 3,
  dateFormat: "dmy",
  decimal: ",",
  skipRows: 2,
};

describe("parseCsv", () => {
  it("reads ; with pt-BR decimals, a quoted delimiter, and leaves the saldo row out", () => {
    const result = parseCsv(fixture("banco-ptbr.csv"), PTBR);
    if (!result.ok) throw new Error(result.error);
    expect(result.statement.lines.map((l) => [l.date, l.description, l.amountBrl])).toEqual([
      ["2026-09-05", "COOPERATIVA MISTA; DIESEL", -3150],
      ["2026-09-10", "TARIFA DOC", -12.5],
      ["2026-09-10", "TARIFA DOC", -12.5],
      ["2026-09-12", "DEP DINHEIRO", 1234.56],
    ]);
    expect(result.statement.period).toEqual({ from: "2026-09-05", to: "2026-09-12" });
  });

  it("keeps two identical lines apart and gives the same ids on a second read", () => {
    const first = parseCsv(fixture("banco-ptbr.csv"), PTBR);
    const again = parseCsv(fixture("banco-ptbr.csv"), PTBR);
    if (!first.ok || !again.ok) throw new Error("unreadable");
    const ids = first.statement.lines.map((l) => l.externalId);
    expect(new Set(ids).size).toBe(4);
    expect(again.statement.lines.map((l) => l.externalId)).toEqual(ids);
  });

  it("reads entrada and saída split in two columns", () => {
    const result = parseCsv(fixture("split-in-out.csv"), {
      delimiter: ",",
      dateColumn: 0,
      descriptionColumn: 1,
      inColumn: 2,
      outColumn: 3,
      dateFormat: "ymd",
      decimal: ".",
      skipRows: 1,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.statement.lines.map((l) => [l.date, l.amountBrl])).toEqual([
      ["2026-09-05", 12000],
      ["2026-09-06", -1280],
    ]);
  });

  it("skips split rows with neither entrada nor saída", () => {
    const mapping: CsvMapping = { ...PTBR, amountColumn: undefined, inColumn: 2, outColumn: 3, skipRows: 1 };
    const result = parseCsv("Data;Desc;Entrada;Saída\n01/09/2026;SALDO APLIC;;\n02/09/2026;PIX;10,00;", mapping);
    if (!result.ok) throw new Error(result.error);
    expect(result.statement.lines.map((l) => [l.description, l.amountBrl])).toEqual([["PIX", 10]]);
  });

  it("reads a date cell with the time after it", () => {
    const result = parseCsv("Data;Desc;Valor\n5/9/2026 10:30;PIX;-1,00", { ...PTBR, amountColumn: 2, skipRows: 1 });
    if (!result.ok) throw new Error(result.error);
    expect(result.statement.lines[0].date).toBe("2026-09-05");
  });

  it("drops only the rows that are a saldo, keeping an aplicação named SALDO", () => {
    const text = [
      "Data;Desc;Valor",
      "01/09/2026;Saldo anterior;5.000,00",
      "01/09/2026;S A L D O;5.000,00",
      "02/09/2026;Saldo do dia;4.000,00",
      "02/09/2026;SALDO APLIC AUT;-1.000,00",
    ].join("\n");
    const result = parseCsv(text, { ...PTBR, amountColumn: 2, skipRows: 1 });
    if (!result.ok) throw new Error(result.error);
    expect(result.statement.lines.map((l) => l.description)).toEqual(["SALDO APLIC AUT"]);
  });

  it("names the file row it cannot read", () => {
    expect(parseCsv("Data;Desc;Valor\n31/02/2026;X;1,00", { ...PTBR, amountColumn: 2, skipRows: 1 })).toEqual({
      ok: false,
      error: "bad_date:2",
    });
    expect(parseCsv("Data;Desc;Valor\n01/09/2026;X;1,00\n02/09/2026;Y;um real", { ...PTBR, amountColumn: 2, skipRows: 1 })).toEqual({
      ok: false,
      error: "bad_amount:3",
    });
    expect(parseCsv("Data;Desc;Valor\n", { ...PTBR, amountColumn: 2, skipRows: 1 })).toEqual({ ok: false, error: "no_lines" });
  });

  it("guesses the mapping of a pt-BR file", () => {
    expect(guessCsvMapping(fixture("banco-ptbr.csv"))).toEqual(PTBR);
  });
});

describe("statement helpers", () => {
  it("reads money the way banks write it", () => {
    expect(parseAmountText("1.234,56", ",")).toBe(1234.56);
    expect(parseAmountText("-1234.56", ".")).toBe(-1234.56);
    expect(parseAmountText("R$ 64,90-", ",")).toBe(-64.9);
    expect(parseAmountText("(10,00)", ",")).toBe(-10);
    expect(parseAmountText("12a", ",")).toBeNull();
  });

  it("hashes identical lines by their occurrence", () => {
    const line = { date: "2026-09-10", description: "TARIFA", amountBrl: -12.5 };
    const [a, b] = lineHashes([line, line]);
    expect(a).not.toBe(b);
    expect(lineHashes([line])[0]).toBe(a);
  });

  it("decodes Windows-1252 when the bytes are not UTF-8", () => {
    expect(decodeBankFile(new Uint8Array([0x48, 0x69, 0x73, 0x74, 0xf3, 0x72, 0x69, 0x63, 0x6f]))).toBe("Histórico");
    expect(decodeBankFile(new TextEncoder().encode("﻿Histórico"))).toBe("Histórico");
  });

  it("tells OFX from CSV and says what went wrong in pt-BR", () => {
    expect(statementFormat("extrato.OFX", "")).toBe("ofx");
    expect(statementFormat("extrato.csv", "<OFX>")).toBe("csv");
    expect(statementFormat("download", "<OFX>")).toBe("ofx");
    expect(statementErrorMessage("bad_date:12")).toBe("Data ilegível na linha 12");
    expect(csvRows('a;"b;c";"d ""e"""', ";")).toEqual([["a", "b;c", 'd "e"']]);
  });
});
