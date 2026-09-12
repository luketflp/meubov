# Importar nascimentos — design

Date: 2026-09-12. Status: approved, ready for the implementation plan.

Design canvas: https://claude.ai/code/artifact/9a88fb6e-77ae-4583-959d-d1e4f45c141f

## Goal

The maternidade keeps a caderno: one line per bezerro with the dam's brinco, the
calf's brinco, sexo, raça, peso, data and lote. At the end of a leva the farmer
has forty or more lines in Excel and today has to type each one into
"Registrar nascimento", picking the dam every time.

"Importar nascimentos" reads that sheet and writes every line the way the
single form does: the parto on the dam, the bezerro in the herd, the birth
weight as the first weighing.

The sheet that shaped this design (`CADERNO MATERNIDADE 25.xlsx`):

```
BRINCO MÃE | BRINCO BEZ | SEXO | RAÇA   | PESO | DATA       | LOTE |
R381       | BB97       | M    | ANGUS  | 28   | 29/09/2025 | 2    |
VM554      | BB127      | F    | NELORE | 26   | 06/10/2025 | 2    | MORREU
R S/ BRINCO| BB128      | M    | NELORE | 28   | 06/10/2025 | 2    |
```

## Entry point

The Nascimentos header gets a second button, outline, to the left of
"Registrar nascimento": **Importar nascimentos** with the `Upload` icon. It
opens a dialog (`sm:max-w-3xl`, like Importar rebanho) with three steps: pick,
preview, done.

## Step 1 — pick

Title "Importar nascimentos". Description: "Envie o caderno da maternidade (.csv
ou .xlsx), uma linha por bezerro. Cada linha registra o parto na matriz e
cadastra o bezerro no rebanho."

A "Colunas esperadas" panel: "brinco da mãe, brinco do bezerro, sexo, raça,
peso (kg, opcional), data do parto (DD/MM/AAAA), lote. Uma coluna a mais com
“morreu” registra a baixa do bezerro." and a **Baixar modelo** link that
downloads `modelo-nascimentos.csv`.

Below it the dashed drop area "Escolher arquivo .csv ou .xlsx". A file that
SheetJS cannot read shows "Não foi possível ler o arquivo. Envie um .csv ou
.xlsx válido." Footer: Fechar.

## Reading the sheet

SheetJS loads on demand, as in Importar rebanho. The first row of the sheet is
the header. Blank rows are ignored. A file over 2000 data rows is refused whole
("O arquivo tem N linhas. O limite por importação é 2000…").

When the workbook has more than one sheet, the preview shows an **Aba** select
next to the file name; changing it re-reads that sheet. The first sheet is the
default.

Text columns (both brincos, sexo, raça, lote) are read as the cell displays
them, so a brinco `0123` keeps its zero. Date and peso are read raw, so a real
Excel date or number survives.

### Headers

Headers are normalized like the herd import (case, accents, punctuation,
spaces). Accepted spellings:

| field | headers |
| --- | --- |
| Brinco da mãe | brinco mãe, brinco da mãe, mãe, matriz, brinco matriz, brinco da matriz |
| Brinco do bezerro | brinco bez, brinco bezerro, brinco bezerra, brinco do bezerro, brinco da bezerra, bezerro, bezerra, brinco cria, cria |
| Sexo | sexo |
| Raça | raça |
| Peso | peso, peso kg, peso ao nascer, peso nascer, peso nascimento |
| Data do parto | data, data do parto, data parto, parto, nascimento, data nascimento, data de nascimento |
| Lote | lote |

A header that starts with "brinco bez" also maps to the calf, since Excel cuts
the column title short.

Required: brinco da mãe, brinco do bezerro, sexo, data do parto, lote. Raça and
peso are optional columns. When a required column is missing the preview shows
"Colunas obrigatórias ausentes: …." and, under it, "Cabeçalho lido no arquivo"
with every non-empty header cell as a chip, plus "Renomeie as colunas na
planilha e envie de novo."

Every column that maps to no field, headed or not, is an extra column.

## Each line

### Values

- **Brinco do bezerro** — required. Trimmed.
- **Sexo** — M/F, macho/fêmea. Blank: "Informe o sexo."; anything else: "Sexo
  não reconhecido (use M ou F)."
- **Data do parto** — `DD/MM/AAAA`, ISO or a real date cell. A bare year is
  refused, since a parto needs its day: "Data inválida (use DD/MM/AAAA)." Blank:
  "Informe a data do parto." After today: "O parto não pode ser no futuro."
- **Peso** — optional, `26` or `26,5`. Invalid: "Peso inválido." It becomes the
  calf's first weighing, dated the parto.
- **Lote** — required. Blank: "Informe o lote."
- **Raça** — see below. The categoria is always bezerro.

### The dam

The cell is matched against the farm's animals, active or not (a vaca sold
after parir still has her parto):

1. An animal whose brinco equals the cell (trimmed).
2. Otherwise, the one animal whose brinco equals it ignoring case.

| cell | outcome |
| --- | --- |
| matches a female | parto on her |
| blank, or reads "sem brinco" / "s/ brinco" (e.g. `R S/ BRINCO`) | calf only — "Mãe sem brinco. Entra só o bezerro." |
| matches a male | calf only — "BR-12 é um macho. Entra só o bezerro." |
| matches nothing | calf only — "R394 não é uma fêmea do rebanho. Entra só o bezerro." |

A calf-only line is importable. It registers the bezerro with no parto, so it
does not appear in the Nascimentos list; the preview says so in amber with the
**Sem mãe** badge.

### Raça

Matched against the farm's raças ignoring case and accents, so `ANGUS` becomes
`Angus` when the farm has Angus. A raça the farm does not have is created on
import; when the cell is all capitals or all lowercase it is created in title
case (`ANGUS` → `Angus`), otherwise as typed. A blank raça takes the dam's;
blank with no dam found: "Informe a raça."

### Morreu

Every extra cell of the line is read. When one contains morreu, morto, morta,
natimorto, natimorta or óbito (case and accents ignored), the calf is imported
and given a baixa por morte dated the parto, with that cell's text as the note.
The preview adds the **Morreu** badge and "Baixa por morte em DD/MM/AAAA."

### Duplicates

A calf brinco already on the farm is "Já existe"; one repeated earlier in the
file is "Repetido no arquivo". Both are skipped, never updated, so sending the
same caderno twice imports only the new lines.

## Lotes

Only lots currently placed in an invernada count. A sheet value matches a lot
when:

1. its normalized name equals the lot's, or else
2. exactly one lot matches once a leading "lote" is dropped and a number loses
   its leading zeros (`2`, `02`, `Lote 2` and `lote 02` all read as `2`).

Every distinct value that stays unmatched gets one line in a **Lote da
planilha** panel above the table: the value as a chip, "N linhas", an arrow and
a lot select ("Nome · Inv. código"). Copy: "Nenhum lote do MeuBov se chama “2”.
Escolha onde esses bezerros entram; vale para todas as linhas." While any value
is unpicked the panel turns amber with "Escolha o lote para liberar a
importação." and the import button is disabled. Only lines that would import
count toward N and toward what needs a pick.

## Step 2 — preview

Description: "Confira as linhas antes de importar. Nada é gravado até você
confirmar."

- File row: spreadsheet icon, file name, and "N linhas · X prontas · Y já
  existe(m) · Z com erro". The Aba select sits at the right when there is more
  than one sheet.
- Notes line, only the parts that apply: "N bezerros sem mãe vinculada" (amber
  dot), "N baixas por morte", "Raça nova: Angus, criada ao importar".
- The Lote da planilha panel, when any value is unmatched.
- The table (desktop): `#`, Mãe, Bezerro, Sexo, Raça, Peso, Data, Lote,
  Situação, scrolling inside `max-h-[45dvh]`. Mãe reads amber on a calf-only
  line. The raça column shows the resolved name. Situação shows Válido, Sem mãe
  (+ note), Válido + Morreu (+ note), Já existe, Repetido no arquivo, or Erro
  with one "Campo: mensagem" per problem in red.
- Phone: the same lines as cards — brinco, "Fêmea · Nelore · 26 kg", the date,
  "Mãe VM554 · lote 2 · linha 31" and the badges.
- The first 200 lines render; below them "Mostrando as primeiras 200 linhas de
  N. Todas as linhas válidas serão importadas."

Footer: Trocar arquivo (back to pick) and **Importar N bezerros**, disabled
while no line is ready or a lote is unpicked.

## Step 3 — done

"N bezerros importados" and, each only when non-zero:

- "N partos registrados nas matrizes."
- "N bezerros entraram sem mãe vinculada: BB125, BB128 e BB140." (up to 10
  brincos, then "e mais N")
- "N baixas por morte: BB127."
- "N linhas ignoradas (brinco já existia)."
- "Raças criadas: Angus."

Toast "N bezerros importados". Footer: Concluir. The herd reloads so the
Nascimentos list shows the new partos.

## Server

`POST /api/herd/births/import`, in the reproduction domain
(`births.controller.ts`, `ImportBirths.useCase.ts`).

Body: `{ births: Row[] }`, 1 to 2000 rows.

```ts
Row = {
  calfEarTag: NonBlankString;
  calfSex: "male" | "female";
  breed: NonBlankString;         // resolved name, new ones included
  lotId: string;
  date: DateString;
  damId?: string;                // absent = calf only
  weightKg?: number;             // > 0
  deathNotes?: string;           // present = baixa por morte on `date`
}
```

One transaction:

1. A date after today refuses the batch: 422 `future_date`.
2. Each distinct `lotId` passes `ValidateLotAssignmentUseCase`; a failure
   refuses the batch: 404 `lot_not_found`.
3. Brincos already on the farm, or repeated in the body, are skipped.
4. `damId` is looked up among the farm's females; one not found is treated as
   calf only, as the preview did.
5. Raças are matched to the farm's ignoring case and accents; missing ones are
   inserted (`onConflictDoNothing`).
6. Calves go in one insert (`calf`, born on `date`, `active: false` with
   `inactiveReason: "death"`, `inactiveDate: date` and the note when
   `deathNotes` is present), `onConflictDoNothing` on `(farm_id, ear_tag)`.
   Rows that lost a concurrent race are reported as skipped.
7. Calvings for the inserted calves that have a dam, and weighings for those
   with a weight, dated `date`.

Response:

```ts
{
  imported: string[];       // calf brincos inserted
  calvings: number;
  withoutDam: string[];
  deaths: string[];
  skipped: string[];
  createdBreeds: string[];
}
```

## Store

`importBirths(rows) => Promise<ImportBirthsSummary>`. On 404 `lot_not_found`
toast "Um dos lotes escolhidos não está mais numa invernada. Escolha de novo."
and throw; any other failure goes through `apiFail("importar os nascimentos")`.
On success it reloads the herd best-effort, as `importHerd` does, and returns
the server summary.

## Code layout

| file | role |
| --- | --- |
| `lib/domain/birthImport.ts` | headers, row parsing, dam/raça/lote matching, morreu, counts, payloads, template, sheet cell merge |
| `lib/api/domains/reproduction/useCases/ImportBirths.useCase.ts` | the transaction |
| `lib/api/domains/reproduction/schemas/reproduction.schema.ts` | `ImportBirthsBody` |
| `lib/api/domains/reproduction/births.controller.ts` | the route |
| `lib/store/useHerdStore.ts` | `importBirths` |
| `components/births/import-births-dialog.tsx` | steps, file reading, footer |
| `components/births/import-births-preview.tsx` | table, phone cards, status badges |
| `components/births/import-births-lots.tsx` | Lote da planilha panel |
| `app/(app)/nascimentos/page.tsx` | the second header button |

`normalizeHeader`, `parseSex`, `parseWeight` and `parseImportDate` are reused
from `herdImport.ts`.

## Testing

- `lib/domain/__tests__/birthImport.test.ts` (TDD): header synonyms and the
  missing-column error, bare year refused, dam outcomes, raça matching and title
  case, lote matching and the pick requirement, morreu detection, duplicates,
  counts, payloads, text-column merge.
- `lib/api/domains/reproduction/useCases/__tests__/ImportBirths.test.ts` with
  the chainable db stub: inserts calves, calvings, weighings and baixas; skips
  existing brincos; downgrades an unknown dam; refuses an invalid lot and a
  future date before writing.
- The route table snapshot gains `POST /api/herd/births/import`.
- Smoke in the real app with the sample sheet.

## Out of scope

- Updating a calf that already exists.
- Creating a dam or a lote from the import.
- Header rows below the first line of the sheet.
- Plan limits (not enforced anywhere yet).
