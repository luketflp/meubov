# Novo Painel — design

Date: 2026-09-22 · Canvas: "MeuBov — Novo Painel", direction A (Rotina), with the
agenda grouped by lote.

## Goal

The Painel opens on what needs a hand today, grouped by the lote where the work
happens, and then answers the farm's standing questions: how the herd is made up
and how it changed, how the breeding season went, how hard the pastures are
worked, how the animals are gaining, what the arroba and the herd are worth, and
what the period earned.

Everything comes from data the store already loads (`animals`, `treatments`,
`lots`, `invernadas`, `lotPlacements`, `movements`, `manejoSessions`,
`expenses`) plus `/api/market/quote`. No new API, no schema change.

## Layout

Desktop (`max-w-6xl`, 12 columns):

1. `PageHeader`: "Painel" with "farm · município · Terça, 22 de setembro"; actions
   "Calendário sanitário" (link) and "Iniciar manejo" (the existing
   `RegisterManejoDialog`, only with Manejo edit).
2. `PendingInviteBanner` and `FirstStepsBanner`, unchanged.
3. Row one: **Agenda da fazenda** (7 columns) | a stack (5 columns) with the open
   manejo sessions, **Rebanho** and **Evolução do rebanho**.
4. Divider "Reprodução e pastos": **Reprodução** (7) | **Lotação por invernada** (5).
5. Divider "Desempenho e mercado": **GMD do rebanho** (7) | **Mercado** (5).
   Without Financeiro the GMD card takes the whole row.
6. Divider "Financeiro" with the `PeriodPicker`: **Financeiro do período**
   (12). Only with Financeiro.

Phone: one column in the order open sessions, agenda, Rebanho, Evolução,
Reprodução, Lotação, GMD, Mercado, Financeiro. The open sessions come before the
agenda on the phone and sit on top of the right stack on desktop, which the page
gets with `display: contents` on the stack below `lg`.

## Agenda da fazenda

One group per lote, lotes in order of their most urgent item. A group header
shows the lote's name, its invernada ("Inv. 01 Baixada") and its active head
count, and links to the lote's ficha. Animals whose lote no longer resolves go to
a last group, "Sem lote".

Items, each placed in the lote the animals stand in today:

| Item | Source | Urgency | Action |
| --- | --- | --- | --- |
| Treatment activity | not-done treatments dated up to today + 7, grouped by date, type and name within the lote | overdue: past date · today · scheduled | "Concluir" marks that lote's batch done (Sanitário edit) |
| Partos previstos sem registro | active dam pregnant now whose expected calving is before today | overdue | "Registrar parto", a link to Nascimentos |
| Partos previstos (7 dias) | same, expected today to today + 7 | scheduled | link to Reprodução |
| Diagnóstico de gestação pendente | the dam's latest cobertura awaits diagnosis (`awaitsDiagnosis`) and is at least 30 days old | today | link to Reprodução > Ultrassom |

The treatment's animal is looked up by ear tag. An inactive or unknown animal
drops out. A treatment activity covering two lotes appears once in each, with that
lote's head count. The pill reads "Atrasada há N dias" / "Hoje" / "dd/mm · em N
dias", the same words as the Manejo activity panel.

Within a lote the items run overdue first (oldest first), then today, then by date.
Lotes run by their first item, and at the same urgency the older date wins. Ties
go by name, and "Sem lote" comes last.

The canvas drew "Iniciar manejo" on treatment rows. A manejo session writes its
own treatment, though, and leaves the scheduled one pending, so the row would stay
overdue after the work was done. The row uses the existing "Concluir" instead, as
the Manejo activity panel does.

Empty: "Nada pendente" with a line saying vacinas, partos and diagnósticos show
up here.

## Rebanho

Active head count with the change over 12 months ("+34 em 12 meses", from the
flow below), a stacked composition bar by category (`countByCategory`), its
legend, and three figures: GMD (`herdAverageAdg`, with the change against the
previous month of `monthlyAdg`), Lotação (`herdStockingRateAuPerHa` and its
class), Peso vivo (arrobas and kg of the active herd).

## Evolução do rebanho

A floating-bar waterfall from the herd at the start of the 12-month window to the
herd today:

- window: from the first day of the month 11 months back until today;
- nascimentos: calvings dated in the window;
- compras: the head count of purchase movements in the window (sessions of
  entrada and legacy rows);
- vendas, mortes (morte + perda) and outras saídas: animals that left in the
  window by `inactiveReason`/`inactiveDate`. "Outras" shows only when above zero;
- today: the active head count;
- start: today − nascimentos − compras + vendas + mortes + outras, floored at 0.

Animals registered by hand have no entry of their own, so they count as already
present at the start. The footnote says what the flow counts.

## Reprodução

Coberturas of the last 12 months: for each active female whose latest cobertura
falls in the window, count expostas, diagnosticadas (pregnant or open), prenhes,
paridas (calved since that cobertura) and sem diagnóstico. Taxa de prenhez =
prenhes / diagnosticadas, "—" without a diagnosis.

Parição chart, six months (two back, the current one, three ahead): calvings
recorded in each month in brand green, and expected calvings still ahead (dam
pregnant now, date today or later) stacked on top as a dashed outline.

Próximos partos: the next four expected calvings from today, ear tag, date and
"em N dias", each opening the dam's ficha.

Empty (no cobertura in the window): the card says so and links to Reprodução.

## Lotação por invernada

`invernadasWithSummary`, occupied ones by UA/ha descending, then the empty ones as
"Em descanso". Each row shows the code and name, then "lote · N cab · faixa" on
its second line and a compact `StockingBar` (value and bar, no label). The header
reads "N invernadas · X ha · Y UA/ha no rebanho". Without invernadas it shows an
empty state that points to Mapa.

## GMD do rebanho

The existing `AdgChart`, with the change against the previous month as a pill in
the header.

## Mercado (Financeiro only)

Arroba price and monthly change from `useArrobaQuote`, a sparkline of its series,
and the herd value (arrobas × price, compact and in full) with the quote's source
line. "—" when the quote is unavailable, as today.

## Financeiro do período (Financeiro only)

In the `PeriodPicker`'s window (default the last 12 months): receita, custo,
resultado and margem líquida (`periodResult`), then "Para onde foi o custo" as a
stacked bar with percentages by category (`costBreakdownBetween`). Next to them,
the monthly receita × custo bars (`BarChart`, brand and fmd). Empty state as the
current cards have.

## Code

- `lib/store/dashboard.ts`, pure and tested: `farmAgenda`, `herdFlow`,
  `seasonReproduction`, `calvingCalendar`, `nextCalvings`, `adgChange`.
- `components/dashboard/`: `FarmAgenda`, `OpenSessionsStack`, `HerdCard`,
  `HerdFlowCard`, `ReproductionCard`, `PaddocksCard`, `MarketCard`,
  `FinanceCard`, the updated `AdgChart`, and a `CalvingBars` chart. The
  `longDateLabel` helper goes in `helpers.ts`.
- `components/charts/sparkline.tsx` for the quote.
- `StockingBar` gains `compact` (no label).
- `pluralCategory(category, 1)` returns the Portuguese singular ("boi"), not
  the enum key, so a row about one animal reads "1 boi".
- Removed as unused: `DashboardKpisRow`, `AnimalsNeedingAttention`,
  `UpcomingTreatments`, `PeriodResultCard`, `ExpensesCard`.

## Tests

Unit tests for every function in `lib/store/dashboard.ts` and for
`longDateLabel`. A smoke run of `/dashboard` against a throwaway database with
the seed, on desktop and phone, with and without Financeiro.
