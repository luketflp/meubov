# Cadastrar vários animais — design

Date: 2026-09-12. Status: approved, ready for the implementation plan.

Design canvas: https://claude.ai/code/artifact/09d2053e-f54d-4861-be52-18986709d6b0

## Goal

A farm registers animals in groups: a truck of compras, a desmama, a leva of
bezerros born in the same season. Today the Rebanho offers two ways in and
neither fits. "Cadastrar animal" takes one animal per dialog, so forty bezerros
are forty dialogs with the same categoria, raça and lote typed forty times.
"Importar rebanho" takes a spreadsheet, which the farmer may not have and has to
build first.

"Vários animais" sits between them: the farmer fills what the group shares
once, lists the brincos, and changes only what differs on each line.

## Entry point

The Rebanho header keeps two buttons. "Importar rebanho" stays as it is.
"Cadastrar animal" becomes **Cadastrar**, which opens a small chooser:

```
Cadastrar animais
Como você quer registrar?

[tag]  Um animal                                         >
       Brinco, categoria, raça, lote e peso de um animal só.
[tags] Vários animais                                    >
       Um padrão para o grupo e uma linha por brinco. Para uma
       compra, uma desmama, uma leva de bezerros.
```

"Um animal" closes the chooser and opens today's dialog, unchanged.
"Vários animais" navigates to `/herd/cadastrar-varios`.

"Em lote" is avoided on purpose: in MeuBov a *lote* is a group of cattle on an
invernada, and this page has a Lote field of its own.

## The page

`/herd/cadastrar-varios`, with a back link to Rebanho, title "Cadastrar vários
animais" and two cards.

### Padrão do grupo

Categoria, Raça, Sexo, Nascimento and Lote, laid out like the single-animal
dialog and following its rules:

- Categoria lists the canonical categories and the farm's custom ones.
- Sexo locks when the categoria implies it (novilha and vaca are fêmea, boi and
  touro are macho).
- Raça lists the farm's breeds. Lote lists the lots currently placed in an
  invernada, shown as "Nome · Inv. código".
- Nascimento is a text field that takes `DD/MM/AAAA` or a bare year, parsed by
  the import's `parseImportDate`, so "2025" is stored as 2025-01-01.
- When the farm has no breed or no placed lot, the same hints as the dialog
  appear under those fields (`animalPrerequisites`) and saving is blocked.

Changing a default changes every line that has not overridden that field.

### Animais

One line per animal, in a table on desktop and a card per animal on the phone.

| column | typed or inherited |
| --- | --- |
| # | line number |
| Brinco | typed, mono |
| Categoria, Raça, Sexo, Nascimento, Lote | inherited from the padrão, overridable |
| Peso (kg) | typed, optional, accepts `182,5` |
| × | removes the line |

An inherited value reads in `text-ink-soft` with no visible border until hover or
focus. Overriding a cell turns it `text-ink` with a small brand dot, and a reset
icon returns it to the padrão. Picking the same value as the padrão counts as no
override, and so does clearing an overridden Nascimento (a typed one stays even
when it matches, so the text never vanishes while being typed). On the phone a card
shows Brinco and Peso, a one-line summary of what differs from the padrão
("Segue o padrão" when nothing does) and "Alterar", which opens the five fields
plus "Remover linha".

Three ways to fill the list, each shown in the card header and, while the list
is empty, in its empty state:

- **Gerar sequência** — Prefixo, Primeiro número, Quantidade. Numbers keep the
  width of the first number, so `0098` runs `0098, 0099, 0100`. The preview names
  the brincos that already exist in the herd.
- **Colar brincos** — a textarea taking a column pasted from a spreadsheet or a
  list from WhatsApp. Lines, commas, semicolons and tabs separate brincos; blank
  entries drop; a brinco repeated inside the paste enters once and the summary
  says so.
- **Digitar** — "Adicionar linha" adds an empty line and focuses its Brinco.
  Enter on a Brinco moves to the next line's Brinco, creating one after the last.

Both dialogs append lines after the last filled one. Blank lines at the end of
the list are replaced rather than kept above the new ones.

A batch holds at most 500 lines. The generator caps its quantity at what is
left, and the paste reports what did not fit.

### Lines that do not count

A line with an empty Brinco, no Peso and no override is blank. Blank lines are
ignored: they are not validated, not counted and not sent. This keeps the Enter
flow from blocking a save on the empty line it just created.

### Validation

Errors come from one pure function over the defaults and the lines, recomputed
on every change. They show under the line (desktop) or inside the card (phone),
in `text-overdue`, with the field's control marked `aria-invalid`.

| problem | message | shown |
| --- | --- | --- |
| brinco already in the herd (active or not) | Já existe um animal com este brinco. | always |
| brinco repeated in the list | Brinco repetido na linha N. | always, on the later line |
| empty brinco on a line that has other data | Informe o brinco do animal. | always |
| Nascimento unreadable | Data inválida. Use DD/MM/AAAA ou só o ano. | always |
| Nascimento in the future | O nascimento não pode ser no futuro. | always |
| Peso not a positive number | Informe um peso válido em kg. | always |
| padrão field missing and some line relies on it | Selecione a categoria. / Selecione a raça. / Selecione o sexo. / Informe a data de nascimento. / Selecione o lote. | after the first save attempt, under the padrão field |

Missing padrão fields stay quiet until the farmer tries to save, so an empty
form does not open covered in red. Everything else is a mistake in what was
typed and shows at once.

### Saving

A bar fixed to the bottom of the viewport (above the tab bar on the phone):

- ready: "**12 animais** prontos · 10 com peso, registrado como a primeira
  pesagem", `[Cancelar]` `[Cadastrar 12 animais]`;
- empty: "Nenhum animal na lista", the primary button disabled;
- with problems: "N linhas com problema" in `text-overdue` with "Remover essas
  linhas", or, after a save attempt, "Complete o padrão do grupo" when only the
  padrão is missing something. The primary button stays disabled until both
  clear. "Remover essas linhas" removes lines with their own errors; missing
  padrão fields are fixed in the padrão.

The save is all or nothing. On success the store gains the new animals, the
toast says "12 animais cadastrados" and the page returns to `/herd`. If the
server reports brincos taken since the page loaded, those lines get the
"Já existe" error and nothing is saved.

### Leaving with unsaved lines

With at least one line that is not blank, the back link and "Cancelar" ask
first:

```
Descartar a lista?
Os 12 animais preenchidos não foram cadastrados.

[Continuar editando]  [Descartar]
```

The browser's own prompt covers reload and closing the tab (`beforeunload`).
Sidebar and tab-bar links are not intercepted; Next has no router-wide hook for
it, and the in-page exits are where a farmer actually leaves the form.

## Server

`POST /animals/batch`, farm-scoped, body `{ animals: NewAnimalBody[] }` with 1 to
500 items. `AddAnimalsUseCase` (`lib/api/domains/animals/useCases/AddBatch.useCase.ts`)
runs one transaction:

1. Normalize the brincos. Repeats inside the body, or brincos already on the
   farm (active or not), return `{ error: "duplicate_ear_tags", earTags }`
   before any write.
2. Validate each distinct lot with `ValidateLotAssignmentUseCase`, which locks it
   against archive and movement for the rest of the transaction. Any failure
   returns `lot_not_found`.
3. Resolve the distinct custom categories in one query. A valid one forces its
   base category, as `InsertAnimalUseCase` does.
4. Insert the animals in one statement, then the initial weighings dated today
   in another.
5. Return the created animals with their weighings, in body order.

A unique violation raised by a concurrent insert maps to
`duplicate_ear_tags` with an empty list. The controller answers 409 for
duplicates and 404 for `lot_not_found`.

Raça is not checked against the farm's breeds, matching `POST /animals`.

## Store

```ts
addAnimals: (animals: NewAnimal[]) => Promise<AddAnimalsResult>;

type AddAnimalsResult =
  | { added: number }
  | { duplicates: string[] };
```

Success appends the returned animals to `animals`; no reload is needed, since no
breed, lot or placement is created. A 409 returns the duplicates. Other errors go
through `apiFail`, which toasts and throws.

## Code layout

| file | role |
| --- | --- |
| `lib/domain/animalBatch.ts` (+ test) | sequence, paste parsing, effective line values, validation, payloads |
| `lib/api/domains/animals/useCases/AddBatch.useCase.ts` (+ test) | the transaction above |
| `lib/api/domains/animals/schemas/animal.schema.ts` | `NewAnimalsBody` |
| `lib/api/domains/animals/animals.controller.ts` | `POST /animals/batch` |
| `lib/store/useHerdStore.ts` | `addAnimals` |
| `components/herd/AddAnimalsButton.tsx` | header button, chooser, single-animal dialog |
| `components/herd/RegisterAnimalDialog.tsx` | controlled `open`/`onOpenChange`, trigger removed |
| `app/(app)/herd/cadastrar-varios/page.tsx` | route |
| `components/herd/batch/BatchRegisterForm.tsx` | page state, save, leave guard, action bar |
| `components/herd/batch/BatchDefaultsCard.tsx` | Padrão do grupo |
| `components/herd/batch/BatchRowsTable.tsx` | desktop table |
| `components/herd/batch/BatchRowCard.tsx` | phone card |
| `components/herd/batch/BatchFieldSelects.tsx` | category, breed, sex and lot selects shared by the three above |
| `components/herd/batch/EarTagSequenceDialog.tsx` | Gerar sequência |
| `components/herd/batch/PasteEarTagsDialog.tsx` | Colar brincos |

## Testing

Test-first for `lib/domain/animalBatch.ts`: the sequence (widths, zero padding,
invalid input, cap), the paste parser (separators, blanks, repeats), effective
values (inherit, override, implied sex beating an override), blank lines, every
validation row of the table above, and payloads (bare year to ISO, comma weight,
custom category).

`AddBatch.useCase.test.ts` uses the chainable db stub of the other use-case
tests for three paths: a clean batch that inserts animals and weighings, a
brinco already on the farm that writes nothing, and a lot that fails
validation.

The page is checked in the running app: generate, paste, override, fix errors,
save, and the phone layout at 390px.

## Out of scope

- Creating breeds or lots from this page (the import still does that).
- Plan limits on head count; the enforcement work is paused and will cover this
  route with the others.
- Keyboard navigation across cells beyond Enter on Brinco.
- Saving a draft of the list between visits.
