import { describe, expect, it } from "vitest";
import { parseScotMsQuote } from "@/lib/data/scot";

/** Minimal snippet of the boi gordo page with the Mercado Físico table. */
const page = (msRow: string) => `
<table>
  <thead><tr><th colspan="3">Boi China a Prazo (R$/@) - 31/07/2026</th></tr></thead>
  <tbody>
    <tr class="conteudo">
      <td class="bd-right">Mato Grosso do Sul</td><td>345,00</td><td>339,50</td>
    </tr>
  </tbody>
</table>
<table>
  <thead><th colspan="11">Mercado F&iacute;sico - 31/07/2026</th></thead>
  <tbody>
    <tr class='conteudo'>
      <td style='text-align: left'>SP Barretos</td>
      <td>344,00</td><td>348,00</td><td></td><td>0,00</td>
    </tr>
    ${msRow}
  </tbody>
</table>`;

const MS_ROW = `<tr class='conteudo'>
  <td style='text-align: left'>MS C. Grande</td>
  <td>336,00</td><td>340,00</td><td></td><td>-2,34</td>
</tr>`;

describe("parseScotMsQuote", () => {
  it("reads the date and the à-vista price of the MS C. Grande row", () => {
    expect(parseScotMsQuote(page(MS_ROW))).toEqual({ date: "2026-07-31", value: 336 });
  });

  it("ignores the Boi China table even when it lists Mato Grosso do Sul", () => {
    // Without the praça row in Mercado Físico there is nothing to read.
    expect(parseScotMsQuote(page(""))).toBeNull();
  });

  it("parses thousands-dotted pt-BR decimals", () => {
    const row = MS_ROW.replace("336,00", "1.336,50");
    expect(parseScotMsQuote(page(row))?.value).toBe(1336.5);
  });

  it("returns null on pages without the Mercado Físico header", () => {
    expect(parseScotMsQuote("<html><body>manutenção</body></html>")).toBeNull();
    expect(parseScotMsQuote("")).toBeNull();
  });
});
