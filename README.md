<div align="center">

# 🐂 MeuBov

### *Todo o seu rebanho de corte sob controle*

Pesagens, GMD, calendário sanitário e cotação da arroba — em um só lugar,<br/>
feito para a fazenda brasileira.

<br/>

![Next.js 16](https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![React 19](https://img.shields.io/badge/React_19-3e7150?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3e7150?style=flat-square&logo=typescript&logoColor=white)
![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_4-3e7150?style=flat-square&logo=tailwindcss&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-3e7150?style=flat-square&logo=vitest&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-3e7150?style=flat-square&logo=pnpm&logoColor=white)

<br/>

| 📊 Painel do rebanho | 🐄 Ficha por animal | 📅 Calendário sanitário | 💰 Cotação da arroba |
| :---: | :---: | :---: | :---: |
| GMD, lotação e indicadores do rebanho em um só painel. | Pesagens, histórico e reprodução de cada cabeça, pelo brinco. | Vacinas, vermífugos e campanha de aftosa sem atraso. | Arroba do boi gordo atualizada e a margem na ponta do lápis. |

</div>

---

Ferramenta de **gestão de rebanho bovino de corte** para o produtor ou gerente de fazenda, com foco em manejo e **rastreabilidade básica** (não é compliance SISBOV completo). Pensada para desktop, mas com os fluxos de entrada de dados usáveis no celular, em campo. Interface toda em **português (pt-BR)**.

## Telas

- **Painel** — total de cabeças, quebra por categoria, animais que precisam de atenção, tendência de GMD e calendário sanitário dos próximos dias.
- **Rebanho** — lista com busca, filtros (categoria, lote, status) e ordenação por qualquer coluna.
- **Ficha do animal** — identificação, evolução de peso com registro de pesagem, linha do tempo, histórico sanitário e ficha reprodutiva (fêmeas).
- **Calendário Sanitário** — visão mensal de tratamentos agendados e atrasados, com destaque para a campanha de aftosa.
- **Movimentação / Lotes** — cards por pasto (taxa de lotação UA/ha), histórico de entradas e saídas e registro de movimentações.
- **Financeiro** — indicadores da pecuária de corte (preço da @, valor do rebanho, margens, relação de troca) com gráficos. **Valores de mercado são ilustrativos.**
- **Configurações** — dados da fazenda, categorias, raças, lotes e protocolos sanitários (que geram a agenda).

## Stack

- **Next.js 16** (App Router, Turbopack) + **React** + **TypeScript** (estrito, sem `any`)
- **Tailwind CSS v4** com design tokens centralizados (`app/globals.css`) + componentes **shadcn/ui**
- **Zustand** para estado global, sobre uma camada de repositório
- **Gráficos em SVG puro**, sem biblioteca de charts (`components/charts/`)
- **Vitest** para os testes de domínio e do seed
- Fontes: **Zilla Slab** (títulos), **IBM Plex Sans** (corpo), **IBM Plex Mono** (números e IDs)

## Como rodar

```bash
pnpm install
pnpm dev      # ambiente de desenvolvimento em http://localhost:3000
pnpm test     # testes unitários (vitest)
pnpm build    # build de produção
pnpm lint     # ESLint
```

> O projeto usa **pnpm** (versão fixada em `packageManager`, no `package.json`).
> O `pnpm-workspace.yaml` define este diretório como raiz do workspace e libera
> os scripts de build das dependências nativas (`sharp`, `unrs-resolver`).

## Banco de dados local (Docker)

Para o desenvolvimento o projeto sobe um **PostgreSQL** local via Docker. A
integração com o banco (Drizzle) entra num passo seguinte — por enquanto isto
apenas disponibiliza o servidor. Requer o **Docker Desktop** em execução.

```bash
pnpm db:up      # sobe o Postgres em background (docker compose up -d)
pnpm db:logs    # acompanha os logs do banco
pnpm db:down    # para o banco
pnpm db:reset   # apaga o volume e recria o banco do zero
```

A string de conexão fica em `.env.local` (carregado automaticamente pelo Next.js;
copie de `.env.example` se necessário):

```
DATABASE_URL="postgresql://meubov:meubov@localhost:5433/meubov"
```

Os dados são **mock determinísticos**: um gerador com semente fixa (`lib/data/seed.ts`) produz sempre o mesmo rebanho, e a data de "hoje" está ancorada em **2026-07-24** (`TODAY_ISO` em `lib/domain/dates.ts`). Isso mantém status, GMD e agenda estáveis entre recarregamentos. Não há backend nem persistência — as alterações vivem em memória durante a sessão.

## Autenticação

A autenticação usa **[Better Auth](https://better-auth.com)** com e-mail/senha e login social opcional com Google. Só a camada de autenticação é persistida no Postgres; o rebanho continua vindo do `MockHerdRepository` nesta fase.

- **Instância servidor:** `lib/auth/index.ts` (adapter Drizzle + `pg`).
- **Cliente:** `lib/auth/client.ts` (`signIn`, `signUp`, `signOut`, `useSession`).
- **Rotas da API:** `app/api/auth/[...all]/route.ts` monta o handler em `/api/auth/*`.
- **Telas:** `/login` e `/signup` (grupo de rotas `(auth)`).

### Variáveis de ambiente

Ficam em `.env.local` (copie de `.env.example`):

```
BETTER_AUTH_SECRET="…"                 # gere com: openssl rand -base64 32
BETTER_AUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID=""                    # opcional
GOOGLE_CLIENT_SECRET=""                # opcional
```

O login por e-mail/senha funciona sem o Google. O botão "Continuar com Google" só é habilitado quando **`GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` estão preenchidos**.

### Configurando o Google (opcional)

No [Google Cloud Console](https://console.cloud.google.com/) crie credenciais OAuth 2.0 e cadastre a **URI de redirecionamento autorizada**:

```
http://localhost:3000/api/auth/callback/google
```

Copie o Client ID e o Client Secret para o `.env.local` e reinicie o servidor.

### Tabelas de autenticação

As tabelas `user`, `session`, `account` e `verification` ficam em `lib/db/schema.ts` (seção "Auth (Better Auth)"). Com o Postgres de pé (`pnpm db:up`), gere e aplique a migração:

```bash
pnpm db:generate   # gera o SQL da migração a partir do schema
pnpm db:migrate    # aplica a migração no banco
```

### Proteção de rotas (otimista)

O `proxy.ts` na raiz (o "middleware" do Next.js 16) faz uma checagem **otimista**: apenas verifica a **presença** do cookie de sessão para redirecionar entre a área logada e `/login` · `/signup`. Ele **não** valida a sessão contra o banco — essa verificação real virá na Fase 2, nos server actions. Isso evita um acesso ao banco a cada navegação.

## Estrutura de pastas

```
app/                     # rotas (App Router) — cada tela é uma page client
  layout.tsx             # fontes, metadata, globals.css (renderiza {children})
  (app)/                 # grupo de rotas AUTENTICADAS (não altera as URLs)
    layout.tsx           # envolve as telas no AppShell (sidebar + tab bar)
    page.tsx             # redireciona / -> /dashboard
    dashboard/ herd/ herd/[earTag]/ calendar/ movements/ finance/ settings/
  (auth)/                # grupo de rotas de autenticação (sem AppShell)
    layout.tsx           # área centralizada com a marca MeuBov
    login/ signup/       # telas de entrar e criar conta
  api/auth/[...all]/     # handler do Better Auth em /api/auth/*
  globals.css            # @theme com TODOS os tokens (cores, fontes) — única fonte de cor

components/
  layout/                # AppShell, Sidebar, MobileTabBar, PageHeader
  ui/                    # shadcn + primitivos do app (StatusPill, KpiCard, SectionCard...)
  charts/                # LineChart, BarChart, DonutChart (SVG puro)
  dashboard/ herd/ animal/ calendar/ movements/ finance/ settings/
                         # componentes específicos de cada tela

lib/
  auth/                  # Better Auth: instância servidor, cliente, erros pt-BR, helpers de usuário
  db/                    # schema Drizzle (domínio + auth) e client (db)
  types.ts               # TODOS os tipos de domínio, num só lugar
  domain/                # regras de negócio PURAS e testáveis (sem React, sem I/O):
                         #   dates, format, weights, adg, status, stocking, reproduction,
                         #   finance, labels
  data/                  # seed determinístico (rng + seed) e mock de mercado (market)
  repository/            # HerdRepository (interface) + MockHerdRepository
  store/                 # useHerdStore (zustand) + selectors puros
```

## Arquitetura em camadas

O dado flui numa direção, e cada camada tem uma responsabilidade única:

```
lib/domain  →  lib/repository  →  lib/store (zustand)  →  telas (app + components)
 (regras)        (fonte de dados)     (estado + ações)        (apresentação)
```

- **`lib/domain`** concentra toda a matemática e as regras (derivação de status, GMD, taxa de lotação, previsão de parto, indicadores financeiros) em funções puras, cobertas por testes.
- **`lib/repository`** abstrai de onde vêm os dados atrás da interface `HerdRepository`.
- **`lib/store`** hidrata a partir do repositório e expõe estado + ações (`markTreatmentDone`, `recordWeighing`, `recordMovement`, etc.); os `selectors` derivam visões prontas.
- **As telas** apenas exibem e disparam ações.

**Regra de ouro:** um componente **nunca** reimplementa regra de negócio — ele chama uma função de `lib/domain` ou um selector. Isso mantém a lógica testável e a UI fina.

## Trocando o mock por uma API real

Toda a camada de dados está atrás de uma interface, então dá para plugar um backend REST/Supabase sem tocar na UI.

**1. Implemente `HerdRepository`** (`lib/repository/HerdRepository.ts`):

```ts
export class ApiHerdRepository implements HerdRepository {
  constructor(private baseUrl: string) {}

  async load(): Promise<HerdData> {
    const resp = await fetch(`${this.baseUrl}/herd`, { cache: "no-store" });
    if (!resp.ok) throw new Error("Falha ao carregar o rebanho");
    return resp.json(); // deve satisfazer o contrato HerdData de lib/types.ts
  }
}
```

Com Supabase, faça as consultas às tabelas e monte o objeto `HerdData` no mesmo formato.

**2. Injete no store** — em `lib/store/useHerdStore.ts`, troque a instância de `MockHerdRepository` usada em `load()` pelo seu repositório (por env var, por exemplo). Nenhum componente precisa mudar. As ações do store (`recordWeighing`, `recordMovement`, ...) são onde você adicionaria as chamadas de escrita (`POST`/`PATCH`) ao backend.

**3. Cotação de mercado** — os valores financeiros do mock são **ilustrativos**. Substitua `MockQuoteSource` por uma implementação real da interface `QuoteSource` (`lib/data/market.ts`), conectando a uma fonte de cotação da arroba como **ESALQ/CEPEA**, **B3** ou **Scot Consultoria**:

```ts
export class CepeaQuoteSource implements QuoteSource {
  async getCurrentQuote(): Promise<ArrobaQuote> { /* fetch da fonte */ }
  async getSeries(months: number): Promise<ArrobaQuote[]> { /* histórico */ }
}
```

## Testes

Os testes (Vitest) cobrem a camada de domínio e o seed — o que dá para verificar de forma determinística:

- **`lib/domain/__tests__`** — datas sem erro de fuso, formatação pt-BR, GMD, derivação de status (limite de 30 dias, diagnóstico pendente), lotação (limites UA/ha), previsão de parto (+283 dias) e a matemática financeira.
- **`lib/data/__tests__/seed.test.ts`** — determinismo do gerador, integridade referencial (todo tratamento/parto aponta para animal existente) e as contagens esperadas do rebanho.

```bash
pnpm test
```

---

<div align="center">

**MeuBov** · Gestão de rebanho de corte · © 2026

</div>
