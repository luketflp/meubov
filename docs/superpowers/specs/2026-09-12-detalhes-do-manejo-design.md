# Detalhes do manejo — design

Date: 2026-09-12. Status: approved, ready for the implementation plan.

Design canvas: https://claude.ai/code/artifact/415a8434-50ff-4fa9-93fb-8741b2be2f33

## Goal

The Histórico de manejos lists what happened at the curral, but only a closed
venda opens a page of its own. A pesagem, a vacinação, a troca de lote or a
compra can only be read as one line: date, name, head count. The farmer who
wants to know how much the boiada gained since May, which animals were skipped
or who got the aftosa has nowhere to look.

Every row of the history now opens a details page.

## What a history row is

Today a "Pesagem" row is every weighing saved on a date, whatever saved it, and
a sanitary row is every done treatment with the same date, type and name. That
mixes a chute pesagem with a birth weight typed the same day, and counts the
weights a venda or troca de lote took twice. The rows now follow what the
farmer did:

1. **One row per manejo session** with at least one animal done, of any kind:
   pesagem, vacina/vermifugação/medicação/exame, troca de lote, venda, entrada.
   Kind is the treatment type for a sanitary session. Responsável is the plan's
   responsável (sanitário) or the counterparty (venda, entrada). Value is the
   plan's cost per head × animals done (sanitário), the traded value (venda,
   entrada), or none. It links to `/manejo/[id]`.
2. **Tratamentos do calendário**: done treatments that no session wrote
   (marked feito on the Calendário sanitário), grouped by date + type + name as
   today, with "Calendário sanitário" under the name. Links to
   `/manejo/avulso/tratamento/[id]`, where `[id]` is any treatment of the group.
3. **Pesagens avulsas**: weighings that no session wrote (ficha, cadastro, peso
   ao nascer, import), grouped by date, named "Pesagens avulsas" with "fora do
   brete" under it. Links to `/manejo/avulso/pesagem/[data]`.

A session animal already records the treatment and the weighing its pass
wrote (`treatmentId`, `weighingId`). To tell a weighing apart on the client,
`Weighing` gains its database `id` (optional in the type, always sent by the
API).

The filter by type, the row menu and its delete stay as they are.

In the table the name is a link for every row and the last cell gains a
chevron link beside the ••• menu. On the phone the card is a link and ends with
"Ver detalhes", or "Continuar no brete" while the session is still open.

## Routes

- `/manejo/[id]`: an open session keeps the chute screen. A closed session
  shows its details page, chosen by kind. An unknown id keeps today's "Manejo
  não encontrado".
- `/manejo/venda/[id]` redirects permanently to `/manejo/[id]` (`next.config.ts`
  `redirects`). Its page file goes away; the venda details become the sale case
  of `/manejo/[id]`.
- `/manejo/avulso/pesagem/[data]` and `/manejo/avulso/tratamento/[id]`. A date
  or id with nothing behind it shows "Registro não encontrado" with the way back.

## The page shell

Width `max-w-5xl`, like the venda.

- **Header**: the manejo name, its type pill beside it, and a subtitle. Actions:
  "Excluir manejo" (ghost, trash icon) and "Voltar ao manejo". Excluir opens the
  existing `DeleteManejoDialog` for the session and goes back to `/manejo` once
  done. The avulso pages have no Excluir; the history row keeps it.
- **Resumo**: a `SectionCard` with a lead line and two columns of `SummaryRow`,
  like the venda's resumo.
- **Animais (N)**: a select "Passaram / Todo o lote" (the venda keeps "Vendidos
  / Todo o lote") and "Buscar brinco". Table on desktop, cards on the phone.
  "Passaram" shows the animals done; "Todo o lote" adds the skipped and the
  pending ones, with "pulado" or "não passou" before their note. The count reads
  "38 de 40" when the scope hides someone. Empty states: "Nenhum animal passou no
  brete. Veja todo o lote." and "Nenhum brinco corresponde à busca."

Categoria, raça, sexo and lote come from the animal as it is now; an animal no
longer in the store shows "—".

## Pesagem

Subtitle: "22/08/2025 · Manejo de 40 animais".

Each line compares the weight with the animal's previous weighing, the last one
dated before the manejo:

- **Ganho** = peso − peso anterior. **GMD** = ganho ÷ days between the two
  dates, with three decimals. Negative values read in `text-overdue`.
- No previous weighing: "—" and the note "primeira pesagem".

Resumo:

- Lead: "38 cabeças pesadas de 40 · 2 puladas".
- Lote: Peso total, @ viva (÷30), Ganho total (suffix "36 com pesagem anterior"
  when not every weighed animal has one).
- Média por cabeça: Peso vivo, @ viva (÷30), Ganho, GMD.
- Ganho and GMD rows only show when at least one animal has a previous weighing.

Columns: Brinco, Categoria, Lote, Peso, Pesagem anterior ("472 kg em 18/05"),
Ganho, GMD kg/dia, Observação. Phone card: brinco and peso on top, "Boi · Boiada
2025", then "anterior 472 kg em 18/05 · +46 kg · 0,479 kg/dia" and the note.

## Sanitário (vacina, vermifugação, medicação, exame)

Subtitle: "15/05/2025 · Aftosa Ourofino · 2 ml · Dr. Paulo Mendes" (the parts
present).

Resumo:

- Lead: "112 cabeças vacinadas de 115 · 3 puladas" — vacinadas, vermifugadas,
  medicadas, examinadas by type.
- Aplicação: Produto, Dose, Responsável, Carência ("30 dias" + "até 14/06/2025";
  "sem carência" at 0).
- Custos e reforço: Custo total, R$/cabeça (only with a cost), Reforço (date +
  "112 agendados", only with a booster date). When the session also weighed:
  Peso médio.

Columns: Brinco, Categoria, Lote, Peso (only when the session weighed), Custo
(only with a cost), Observação.

## Troca de lote

Subtitle: the date and `movementSubtitle` ("Destino: Recria Fêmeas").

Resumo:

- Lead: "24 cabeças foram para Recria Fêmeas".
- De onde saíram: one row per previous lote with its head count, most first
  ("Lote excluído" when the lote is gone from the store).
- Pesagem no brete (only when the session weighed): Pesadas, Peso médio, Peso
  total.

Columns: Brinco, Categoria, Raça, Lote anterior, Peso (when weighed), Observação.

## Entrada (compra)

Subtitle: the date and `movementSubtitle`.

Resumo:

- Lead: "30 cabeças de Fazenda Boa Vista, no lote Recém-chegados".
- Compra: Vendedor, Valor total, R$/cabeça.
- Peso de entrada (only when weighed): Pesadas, Peso médio, R$/@ viva (value ÷
  (total kg ÷ 30), only when every animal done was weighed and there is a value).

Columns: Brinco, Categoria, Raça, Sexo, Peso de entrada, Observação.

## Venda

Today's `SaleDetail`, unchanged in content, now rendered for a closed sale at
`/manejo/[id]` and using the shared header, so it gains "Excluir manejo".

## Pesagens avulsas

Title "Pesagens avulsas", pill Pesagem, subtitle "06/10/2025 · fora do brete",
only "Voltar ao manejo".

A note above the resumo: "Pesos salvos neste dia fora de um manejo no brete: na
ficha do animal, no cadastro ou como peso ao nascer. Para apagar, use o menu da
linha no histórico."

Resumo: lead "7 animais pesados · 5 pesos ao nascer" (second part only when
present); Pesos: Peso total, Peso médio; Ao nascer (only when present): Bezerros,
Peso médio ao nascer.

A weight is "ao nascer" when its date is the animal's birth date. Columns:
Brinco, Categoria, Lote, Peso, Pesagem anterior (the "ao nascer" badge in its
place), GMD kg/dia. Search only, no scope select.

## Tratamentos do calendário

Title: the treatment name, pill of its type, subtitle "20/07/2025 · Calendário
sanitário", only "Voltar ao manejo".

Resumo: lead "12 cabeças"; Aplicação: Dose, Responsável, Carência (the longest
among the group); Custos: Custo total, R$/cabeça (when any cost).

Columns: Brinco, Categoria, Lote, Dose, Custo, Observação. Search only.

## Code layout

| file | role |
| --- | --- |
| `lib/types.ts`, `lib/api/mappers.ts` | `Weighing.id` |
| `components/manejo/helpers.ts` | `manejoHistory` rows per the rules above, `subtitle` on a row |
| `lib/domain/manejoDetail.ts` | lines and totals of each page, previous weighing and gain, scope + search |
| `components/manejo/detail-shell.tsx` | header with delete, resumo card, animals card with scope and search |
| `components/manejo/weighing-detail.tsx` | pesagem |
| `components/manejo/treatment-detail.tsx` | sanitário |
| `components/manejo/transfer-detail.tsx` | troca de lote |
| `components/manejo/entry-detail.tsx` | entrada |
| `components/manejo/sale-detail.tsx` | venda, on the shared header |
| `components/manejo/loose-weighings-detail.tsx` | pesagens avulsas |
| `components/manejo/calendar-treatments-detail.tsx` | tratamentos do calendário |
| `components/manejo/manejo-screen.tsx` | chute screen or details by status and kind |
| `components/manejo/manejo-history.tsx` | links, chevron, subtitle, phone card label |
| `app/(app)/manejo/[id]/page.tsx` | renders `ManejoScreen` |
| `app/(app)/manejo/avulso/pesagem/[data]/page.tsx`, `.../tratamento/[id]/page.tsx` | avulso routes |
| `app/(app)/manejo/venda/[id]/page.tsx` | removed |
| `next.config.ts` | venda redirect |

## Testing

- TDD for `manejoHistory` (session rows of every kind, calendar groups, loose
  weighings, links, subtitles) and every function of `lib/domain/manejoDetail.ts`.
- tsc, eslint, the full suite, `next build`.
- Headless run against the real app: open every kind from the history, the
  scope switch and search, a delete from a details page, the redirect from
  `/manejo/venda/[id]`, the avulso pages, and the phone layout.

## Out of scope

- Editing a line or undoing a pass from the details page.
- Printing or exporting a record.
- The lote an animal was in on the day of a pesagem (the page shows the current
  one).
- The weighings delete still works by date + brincos, as today.
