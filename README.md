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
- **Ficha do animal** — identificação, evolução de peso com registro de pesagem, linha do tempo, histórico sanitário e ficha reprodutiva das fêmeas (registro de cobertura, diagnóstico de gestação e parto — o bezerro entra no rebanho junto).
- **Calendário Sanitário** — visão mensal de tratamentos agendados e atrasados, com destaque para a campanha de aftosa.
- **Manejo** — sessões de curral: vacina, vermifugação, medicação, exame, pesagem e também **troca de lote, venda e entrada (compra)**. Os animais passam um a um no brete, a sessão fica salva e pode ser retomada, e cada passagem pode ser desfeita.
- **Lotes** — grupos lógicos de animais, com a invernada atual, movimentação do lote inteiro e histórico das invernadas ocupadas.
- **Mapa** — invernadas físicas fixas, com código, contorno, lotes ocupantes e taxa de lotação combinada (UA/ha).
- **Financeiro** — indicadores da pecuária de corte (preço da @, valor do rebanho, margens, relação de troca) com gráficos. Receitas vêm das vendas com valor, custos das despesas lançadas + tratamentos com custo; a cotação da arroba é real (Scot Consultoria + histórico IPEADATA).
- **Configurações** — dados da fazenda, categorias, raças, invernadas e protocolos sanitários (que geram a agenda).

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

Para o desenvolvimento o projeto sobe um **PostgreSQL** local via Docker.
Requer o **Docker Desktop** em execução.

```bash
pnpm db:up      # sobe o Postgres em background (docker compose up -d)
pnpm db:logs    # acompanha os logs do banco
pnpm db:down    # para o banco
pnpm db:reset   # apaga o volume e recria o banco do zero

pnpm migration:run                    # aplica as migrations (Drizzle)
pnpm db:seed --email voce@exemplo.com # semeia o rebanho de demonstração para um usuário existente
```

A string de conexão fica em `.env.local` (carregado automaticamente pelo Next.js;
copie de `.env.example` se necessário):

```
DATABASE_URL="postgresql://meubov:meubov@localhost:5433/meubov"
```

O rebanho é **persistido no Postgres** e servido pela API do rebanho (Elysia em `/api/herd`). O gerador determinístico de semente fixa (`lib/data/seed.ts`) continua existindo como dado de demonstração: `pnpm db:seed --email <usuário>` insere a Fazenda Boa Vista completa para um usuário já cadastrado (`--force` apaga as fazendas dele e re-semeia). O dado de demonstração é ancorado em **2026-07-24** (`SEED_TODAY_ISO` em `lib/data/seed.ts`); o aplicativo usa a data real da fazenda em `America/Sao_Paulo`.

O modelo é **multi-fazenda**: um usuário pode participar de várias fazendas (`farm_users`); todas as tabelas do rebanho são escopadas por `farm_id`. No primeiro acesso de um usuário sem fazenda, uma fazenda vazia é criada automaticamente.

## Autenticação

A autenticação usa **[Better Auth](https://better-auth.com)** com e-mail/senha e login social opcional com Google. A sessão também protege a API do rebanho: cada rota resolve o usuário e a fazenda ativa (cabeçalho opcional `x-farm-id`) antes de tocar no banco.

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
    dashboard/ herd/ herd/[earTag]/ calendar/ manejo/ manejo/[id]/ lots/ map/ finance/ settings/
  (auth)/                # grupo de rotas de autenticação (sem AppShell)
    layout.tsx           # área centralizada com a marca MeuBov
    login/ signup/       # telas de entrar e criar conta
  api/auth/[...all]/     # handler do Better Auth em /api/auth/*
  globals.css            # @theme com TODOS os tokens (cores, fontes) — única fonte de cor

components/
  layout/                # AppShell, Sidebar, MobileTabBar, PageHeader
  ui/                    # shadcn + primitivos do app (StatusPill, KpiCard, SectionCard...)
  charts/                # LineChart, BarChart, DonutChart (SVG puro)
  dashboard/ herd/ animal/ calendar/ manejo/ lots/ map/ finance/ settings/
                         # componentes específicos de cada tela

lib/
  auth/                  # Better Auth: instância servidor, cliente, erros pt-BR, helpers de usuário
  db/                    # schema Drizzle (domínio + auth) e client (db)
  types.ts               # TODOS os tipos de domínio, num só lugar
  domain/                # regras de negócio PURAS e testáveis (sem React, sem I/O):
                         #   dates, format, weights, adg, status, stocking, reproduction,
                         #   finance, labels
  data/                  # seed determinístico (rng + seed) e cotação real (market/scot/ipeadata)
  repository/            # HerdRepository (interface) + ApiHerdRepository
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

## API do rebanho (Elysia)

A camada de dados real vive em **[Elysia](https://elysiajs.com)**, montado no route handler `app/api/herd/[[...slugs]]/route.ts` (Next 16 entrega `Request` padrão Web, que o `herdApi.handle()` consome direto).

- **App e rotas:** `lib/api/app.ts` — leitura (`GET /api/herd`) e todas as mutações (animais, pesagens, tratamentos, reprodução, manejo, raças, lotes, invernadas, posicionamentos, fazenda e protocolos), validadas com TypeBox (`lib/api/models.ts`).
- **Contexto de fazenda:** `lib/api/plugins/farm.ts` resolve sessão (Better Auth) + fazenda ativa; usuário sem fazenda ganha uma automaticamente (`lib/api/services/onboarding.ts`).
- **Serviços:** `lib/api/services/*` — consultas/transações Drizzle escopadas por `farm_id`; o manejo roda cada passagem em transação com lock (`FOR UPDATE`), impedindo passagem dupla no brete.
- **Cliente:** `lib/api/client.ts` usa **Eden Treaty** (`treaty<HerdApi>`), com tipos ponta a ponta derivados do próprio app Elysia (import apenas de tipo). O store (`useHerdStore`) chama a API e mescla a resposta no estado; `ApiHerdRepository` faz a carga inicial.

**Cotação de mercado** — real, sem mock. `GET /api/market/quote` busca em paralelo o preço atual na **Scot Consultoria** (boi gordo à vista C. Grande-MS, cache 6h) e o histórico mensal no **IPEADATA** (série Seab/Deral-PR, cache 24h), mesclados por `mergeQuotePayload` (`lib/data/market.ts`). Se ambas as fontes falharem, o cliente mostra "—" em todos os valores dependentes da arroba — nunca um número falso.

**Financeiro real** — receita = movimentações de **venda** com `amountBrl`; custo = **despesas** (`expenses`, 7 categorias, CRUD na tela Financeiro) + tratamentos concluídos com `costBrl`. As derivações (série mensal, composição de custos, indicadores) são funções puras em `lib/domain/economics.ts`; indicadores sem dados suficientes mostram "—".

**Movimentações derivadas** — compra, venda e transferência não são mais digitadas: são **sessões de manejo** (`kind` = `entry` / `sale` / `transfer`) em que cada animal passa no brete. O razão de entradas e saídas (`Movement[]`) é uma **projeção** dessas sessões (`lib/domain/movements.ts`), então quantidade e categoria sempre vêm dos animais reais — nunca de um campo de formulário. A venda pode ser precificada por **R$/@** (valor de cada animal = peso na balança em arrobas × preço) ou por um **valor fechado** do lote. Linhas antigas da tela "Registrar movimentação" continuam no razão como histórico legado.

**Lote ≠ invernada** — o lote é o grupo de animais e continua sendo a
referência de cada cabeça. A invernada é a área física, com código fixo,
capim, hectares e contorno. `LotPlacement[]` registra, por data, em qual
invernada cada lote está; mais de um lote pode ocupar a mesma invernada.

## Testes

Os testes (Vitest) cobrem regras puras de domínio, integrações de dados, o seed e seletores do store:

- **`lib/domain/__tests__`** — datas sem erro de fuso, formatação pt-BR, GMD, derivação de status (limite de 30 dias, diagnóstico pendente), lotação (limites UA/ha), previsão de parto (+283 dias) e a matemática financeira.
- **`lib/data/__tests__`** — fontes de cotação, determinismo do gerador, integridade referencial e as contagens esperadas do rebanho.
- **`lib/store/__tests__`** — seletores de lotes, invernadas, ocupação e taxa de lotação.
- **`lib/api/services/__tests__`** — helpers isolados da camada de serviço; as transações ainda precisam de testes com Postgres.

```bash
pnpm test
```

---

<div align="center">

**MeuBov** · Gestão de rebanho de corte · © 2026

</div>
