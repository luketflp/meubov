# Exportação e Relatórios — design

Date: 2026-09-22. Canvas: https://claude.ai/artifact/CMpFyhEgXZYcfAEvPe1Mny

## Why

ROADMAP §7 says it plainly: nothing leaves the app. Producers need three things.

- A spreadsheet to analyse on their own, or to send to the technician.
- A printout or PDF.
- The documents third parties ask for: the state defence agency, the frigorífico, the bank, and the vet or consultor.

## What

1. **Exportar on every list.** An outline button in the page header opens a menu.
   - It exports what the screen shows: the same selectors, filter and order.
   - When a filter narrows the list, the menu also offers the whole list ("Filtro atual" / "<lista> todo").
   - Formats:
     - Planilha Excel (.xlsx): one sheet per table plus a "Sobre" sheet with farm, date, user, filters and row counts.
     - CSV: `;`-separated, decimal comma, dd/mm/aaaa, BOM.
     - Imprimir ou salvar PDF: an A4 sheet with the farm header.
2. **Relatórios page** (`/relatorios`, a sidebar item after Financeiro, reached from "Mais" on the phone).
   - Four document cards: Declaração de rebanho, Romaneio de venda, Relatório para banco and Relatório técnico. Each opens its own page, with parameters and a live A4 preview.
   - Nine planilhas (Animais, Pesagens, Tratamentos, Coberturas e diagnósticos, Nascimentos, Baixas, Manejos, Lotes e invernadas, Despesas), each offered as .xlsx or .csv.
   - "Baixar tudo (.xlsx)": one file with one sheet per planilha.
3. **Documents**, printed through the browser ("Salvar como PDF"; there is no PDF library):
   - **Declaração de rebanho.** Takes a data-base and a "movimentação desde" date. It shows the balance by sex × age band (0–12, 13–24, 25–36, >36 months, age at the data-base) and by category. It shows the movimentação between the two dates: saldo anterior, + nascimentos, + compras, − vendas, − mortes, − outras baixas, = saldo, with an "ajuste" line when hand-registered animals make it not add up. Animals without a birth date are placed by category, and a note counts them. It ends with signature lines.
   - **Romaneio de venda.** Built from one sale manejo, picked on the page or linked from the sale's detail screen. It lists nº, brinco, categoria, raça, idade, peso vivo, @ carcaça and valor, with totals and a row of figures. The comprador and the GTA nº are blank lines when unknown. It ends with signatures for vendedor and comprador. It needs Financeiro view.
   - **Relatório para banco.** Its parameters:
     - data-base;
     - R$/@, prefilled from the last priced sale;
     - rendimento %, prefilled from that sale or 50;
     - R$/cabeça per category, for animals with no weighing on or before the data-base;
     - toggles for evolução 12 meses, peso médio por lote and assinatura.

     The value of a weighed animal is last weight × rendimento ÷ 15 × R$/@. The report shows figures (cabeças, peso vivo pesado, arrobas de carcaça, valor), an inventory by category, the 12-month flow, the lots and a method note. It needs Financeiro view.
   - **Relatório técnico.** Takes a period and a lote (optional). It covers the season (expostas, diagnosticadas, prenhes, vazias, taxa), prenhez by bull, partos (previstos, nascidos, next 30 days, atrasados), GMD by lote between the first and last weighing of the period, and sanidade (manejos, aplicações, animals in carência today).

## Screens with Exportar

The map is the canvas's row 4:

- Rebanho.
- Ficha do animal: printed ficha, plus its pesagens.
- Lote.
- Lotes.
- Manejo histórico.
- Manejo detalhe. A sale's detail also gets "Romaneio".
- Nascimentos.
- Baixas.
- Reprodução: Coberturas, Ultrassom and Touros.
- Calendário sanitário.
- Financeiro.

## Rules

- **Client-side only.** The store already holds the farm's `HerdData`, so no API changes are needed.
- **Permissions.** Anyone who can view an area can export it.
  - Money columns (`kind: "money"`) are dropped for members without Financeiro view.
  - The server already strips the values themselves (`redactHerdMoney`).
  - Banco and Romaneio are hidden without Financeiro view.
- **Plans** are not enforced yet, so export is on every tier.
- **XLSX styling.** The xlsx has no bold or colour: the community SheetJS build writes no styles. Dates are real dates, numbers are real numbers, columns have widths and number formats.
- **Page numbers.** Print has no "Página x de y": Chrome cannot count pages outside the margin boxes.
- **No history.** "Última geração" is not stored. The cards show facts derived from the data (e.g. the last sale).

## Architecture

- `lib/export/table.ts`
  - `ExportTable` holds a title, typed columns (text, number, date, money) and cells.
  - `buildTable`, `withoutMoney`, `formatCell` (for print) and `plainCell` (for CSV).
- `lib/export/csv.ts`, `lib/export/xlsx.ts` (dynamic `import("xlsx")`), `lib/export/download.ts` and `lib/export/fileName.ts`. File names look like `rebanho_fazenda-boa-vista_2026-09-22.xlsx`.
- `lib/export/datasets/<area>.ts`: pure builders from store data to `ExportTable`. The screens use them, and so does "Baixar tudo".
- `lib/reports/*.ts`: pure selectors for the four documents, TDD.
- `components/export/ExportMenu.tsx` is the button.
- `components/export/useExportContext.ts` provides the farm, user and timestamp.
- `components/print/PrintSheet.tsx` has the A4 sheet, header with the still Nelore mark, footer, table, fields, figures, signatures and note.
- `components/print/PrintRoot.tsx` plus `lib/store/usePrintStore.ts` print a list:
  - the menu sets a job;
  - AppShell hides the app on paper;
  - PrintRoot draws the job and calls `window.print()`;
  - `afterprint` clears the job.
- Report pages print themselves: their controls are `print:hidden` and the `A4Sheet` drops its frame on paper.
- `@page { size: A4; margin: 12mm }` in globals.css.

## Testing

- Vitest for `lib/export` and `lib/reports` (pure).
- Typecheck and lint.
- A smoke test in the running app: every Exportar menu opens, downloads an xlsx and csv, and prints. The report pages render with seeded data.
