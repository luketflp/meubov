# Nova home (landing com planos) — design

Date: 2026-09-11. Status: approved layout (design canvas, hero with the
illustration), ready to implement. Canvas:
https://claude.ai/code/artifact/56b576a9-1868-4080-a3d9-b745b366338c

Companion spec, to be written next: assinaturas (Stripe). This one ships alone:
the plans are presented and every paid CTA lands on a `/checkout` page that,
until billing exists, hands the visitor to WhatsApp.

## Goal

Turn the one-screen landing into a marketing page that converts: one primary
action ("Criar conta grátis") repeated down the page, WhatsApp as the second
door, prices on the table (every incumbent hides them), a free tier that never
expires, and answers to the doubts a produtor has before signing up. Copy is
pt-BR and grounded in what the app does today; nothing promised that does not
exist (no offline, no app store, no export).

## Plans (single source of truth)

`lib/domain/plans.ts`, pure and unit-tested:

```ts
export type PlanId = "curral" | "fazenda" | "fazenda_pro" | "consultor";
export type BillingInterval = "month" | "year";

export interface Plan {
  id: PlanId;
  name: string;                 // "Curral", "Fazenda", "Fazenda Pro", "Consultor"
  /** Monthly price in centavos; null for the quote-only tier. */
  monthlyBrl: number | null;    // 0, 8900, 18900, null
  /** Annual price in centavos (10 × monthly); null when not sold or free. */
  yearlyBrl: number | null;     // null, 89000, 189000, null
  /** Active-animal cap; null = unlimited. */
  maxHeads: number | null;      // 50, 500, 2000, null
  maxFarms: number | null;      // 1, 1, 3, null
  maxUsers: number | null;      // 1, 3, null, null
  /** The bullets on the pricing card, in order. */
  bullets: readonly string[];
  highlighted: boolean;         // only "fazenda"
}
export const PLANS: readonly Plan[];
export function planById(id: string): Plan | null;
/** "R$ 89" / "R$ 1.890" from centavos, no decimals when whole. */
export function formatPlanPrice(centavos: number): string;
/** Months saved on the annual price: 2 for Fazenda and Fazenda Pro, 0 for Curral and Consultor. */
export function annualFreeMonths(plan: Plan): number;
```

Bullets, verbatim from the canvas:

- Curral: "1 fazenda · 1 usuário", "Todas as telas", "Importação da planilha", "Suporte por e-mail".
- Fazenda: "1 fazenda · 3 usuários", "Todas as telas", "Importação da planilha", "Suporte no WhatsApp".
- Fazenda Pro: "3 fazendas · usuários ilimitados", "Todas as telas", "Importação da planilha", "Suporte prioritário no WhatsApp".
- Consultor: "Preço por fazenda", "Painel de todas as fazendas", "Desconto para associações", "Gerente de conta".

Cap labels on the cards: "até 50 cabeças", "até 500 cabeças", "até 2.000
cabeças", "fazendas ilimitadas" (derived: `maxHeads` formatted with
`formatNumber`, or the literal for Consultor).

## WhatsApp

`lib/marketing/whatsapp.ts`, pure and unit-tested:

```ts
/** wa.me link with the prefilled text, or null when NEXT_PUBLIC_WHATSAPP_NUMBER is unset. */
export function whatsappLink(number: string | undefined, text: string): string | null;
```

`NEXT_PUBLIC_WHATSAPP_NUMBER` (digits only, with country code, e.g.
`5534999990000`) goes into `.env.example` with a comment. When it is unset every
WhatsApp button and the Consultor CTA are simply not rendered — never a dead
link. Prefilled texts:

- hero and final CTA: "Olá! Quero saber mais sobre o MeuBov."
- Consultor card: "Olá! Quero conversar sobre o plano Consultor do MeuBov."
- `/checkout` page: "Olá! Quero assinar o plano {name} ({mensal|anual}) do MeuBov."

## Page

`app/page.tsx` stays a server component with the `AuthDialog` islands; the
sections move to `components/landing/`, one file each, all server components
unless noted. Container `mx-auto w-full max-w-5xl px-6`. Sections in order,
matching the canvas:

1. `LandingHeader` — wordmark + "Gestão de rebanho de corte" (hidden under
   `sm`), anchors "Como funciona" `#como-funciona`, "Planos" `#planos`,
   "Perguntas" `#perguntas` (hidden under `md`), "Entrar" (outline, `LogIn`,
   `AuthDialog login`) and "Criar conta grátis" (primary, hidden under `md`,
   `AuthDialog signup`). Buttons `min-h-11 md:min-h-9`.
2. `Hero` — h1 "Todo o seu rebanho de corte sob controle", the existing
   subtitle, primary "Começar grátis" with `ArrowRight` (`AuthDialog signup`,
   `size="lg"`, `min-h-11`), outline "Falar no WhatsApp" with `MessageCircle`
   (only with a number), microcopy `text-[13px] text-ink-soft` "Grátis até 50
   cabeças · sem cartão · importe sua planilha em minutos", `NeloreMark` as
   today (`durationMs={4000} loop={false}`). Grid `lg:grid-cols-2 gap-10`.
3. `FarmsMarquee` — the existing marquee moved out of `page.tsx` unchanged
   (same `FARMS`, `FILLED_FARMS`, `FarmLogoSet`).
4. `HowItWorks` (`id="como-funciona"`) — eyebrow "Como funciona", h2 "Do Excel
   ao brete em três passos", lead "Nada de implantação de semanas. O rebanho
   entra hoje e o manejo de amanhã já sai no celular.", three steps
   (`Upload`, `Syringe`, `TrendingUp`), copy verbatim from the canvas. Grid
   `md:grid-cols-3 gap-10`.
5. `Features` — surface band (`bg-surface border-y border-hairline`), eyebrow
   "O que vem junto", h2 "Tudo que a fazenda de corte usa, sem módulo pago à
   parte", lead "Cada plano abre todas as telas. O que muda é o tamanho do
   rebanho e quantas pessoas entram.", six items (`LayoutDashboard`, `Beef`,
   `CalendarDays`, `Syringe`, `Map`, `CircleDollarSign`) with the canvas
   copy; the icon badge is today's `size-9 rounded-lg bg-brand-soft
   text-brand`. Grid `sm:grid-cols-2 lg:grid-cols-3`.
6. `Pricing` (`id="planos"`) — eyebrow "Planos", h2 "Preço na tabela, não no
   orçamento", lead "Cabeça é animal ativo: vendido e morto não contam. Sem
   taxa de implantação. Cancele quando quiser.", four `PlanCard`s from
   `PLANS` in `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`, then the three
   notes row (`ShieldCheck` "30 dias de garantia: não viu valor, devolvemos";
   `Check` "Cartão no mensal · Pix, boleto ou cartão no anual"; `Check`
   "Passou do limite? Você continua vendo tudo, só sobe de plano para
   cadastrar mais").
   - `PlanCard`: `rounded-lg border border-hairline bg-panel p-6 flex
     flex-col gap-4`; highlighted → `border-brand ring-1 ring-brand` and the
     `Badge`-styled pill "Mais escolhido" (`bg-brand-soft text-brand`).
     Price `font-mono text-[28px] leading-9 font-semibold` with the soft
     "/mês" (Consultor: "Sob medida" at `text-[22px]`). Second line
     `text-xs text-ink-soft`: Curral "Sem cartão, sem prazo."; paid "ou
     {annual} /ano — 2 meses grátis"; Consultor "Vets, consultores,
     cooperativas e rebanhos acima de 2.000 cabeças.". Cap label
     `font-medium border-t border-hairline pt-3`. Bullets with `Check`
     `text-brand`. CTA at the bottom (`mt-auto`, full width, `min-h-11
     md:min-h-9`):
       - Curral: outline "Começar grátis" → `AuthDialog signup`.
       - Fazenda: primary "Assinar Fazenda" → `AuthDialog signup
         next="/checkout?plan=fazenda&interval=month"`.
       - Fazenda Pro: outline "Assinar Pro" → same with `plan=fazenda_pro`.
       - Consultor: outline "Falar no WhatsApp" → WhatsApp link (rendered only
         with a number; otherwise the card shows the outline "Falar com a
         gente" that opens `AuthDialog signup` — no dead card).
7. `Testimonial` — rendered only when `TESTIMONIAL` in
   `components/landing/content.ts` is not null (`{ quote, name, farm, city,
   heads }`). Ships as `null`. Markup as the canvas (surface figure, Zilla
   quote, avatar initials).
8. `Faq` (`id="perguntas"`) — surface band, eyebrow "Perguntas", h2 "O que
   perguntam antes de assinar", six native `<details>`/`<summary>` items with
   the canvas Q&A verbatim, `ChevronDown` rotating via
   `group-open:rotate-180`; `summary` is `min-h-11` on mobile. Grid
   `md:grid-cols-3` with the list spanning two columns.
9. `FinalCta` — h2 "Comece com o rebanho que você tem hoje", lead "Até 50
   cabeças é grátis, para sempre. Quando o rebanho crescer, o plano cresce
   junto.", primary "Criar conta grátis" + outline "Falar no WhatsApp".
10. `LandingFooter` — "© 2026 MeuBov · Gestão de rebanho de corte" and links
    Planos, Perguntas, Entrar (opens the login dialog), Termos (`/termos`),
    Privacidade (`/privacidade`). The two legal pages are out of scope here;
    until they exist the links are omitted (a `LEGAL_PAGES` boolean in
    `content.ts`, default false).

Every section heading uses `font-heading text-3xl font-semibold text-ink`
(mobile `text-[28px] leading-[34px]`), eyebrows `text-xs font-medium uppercase
tracking-[0.06em] text-brand`, leads `text-base text-ink-soft`. Sections get
`scroll-mt-6`. `metadata` keeps today's title and description; the
description gains "Grátis até 50 cabeças."

## Auth handoff

`AuthDialog` gains `next?: string` and passes it to `LoginForm`, which calls
`navigateAfterAuth(router, next ?? "/dashboard")`. Signup keeps today's
behavior (switch to login with the notice), so the `next` survives inside the
same dialog. `next` must start with "/" (relative only); anything else is
ignored.

## `/checkout` (placeholder until the assinaturas spec)

`app/(app)/checkout/page.tsx` ("use client"), reads `plan` and `interval` with
`useSearchParams`. Unknown plan or Curral → redirect to `/dashboard`. Otherwise
a single `SectionCard` "Assinar {plan.name}" with the price for the chosen
interval, the cap line, the bullets, and:

- with a WhatsApp number: primary "Assinar pelo WhatsApp" (prefilled text
  above) and the note "A assinatura pelo cartão dentro do app chega em breve.
  Enquanto isso, fechamos pelo WhatsApp, com Pix ou boleto.";
- without: the note only, plus "Voltar ao painel".

Not in the nav; `isActiveRoute` unaffected.

## Conventions

- pt-BR copy, tokens only, 44px touch targets on mobile.
- Read `node_modules/next/dist/docs/` before touching routing.
- TDD for `plans.ts` and `whatsapp.ts`. Component files have no test harness.
- No commits from implementation agents; one commit at the end.
- Smoke: screenshot `/` logged out at 1440 and 390 px; anchors scroll; the
  Fazenda CTA opens the signup dialog; `/checkout?plan=fazenda&interval=month`
  renders after login.

## Out of scope

Stripe, plan storage, head-count gating (next spec); Termos and Privacidade
pages; real testimonials and additional farm logos (drop the files into
`public/farms` and the `FARMS` list); analytics; a billing toggle on the cards
(both prices are printed).
