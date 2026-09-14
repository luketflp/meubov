# Roadmap — o que falta

Levantamento feito em **04/08/2026** varrendo `app/`, `components/`, `lib/` e o
schema (`lib/db/schema.ts`). Cada item cita os arquivos envolvidos. A suíte
passa — nada aqui é bug, é funcionalidade ausente.

---

## 1. ~~Reprodução — só leitura~~ ✅ feito em 04/08/2026

Cobertura, diagnóstico de gestação e parto agora são registráveis na ficha da
fêmea. A seção "Reprodução" aparece para **toda fêmea**, com ou sem histórico —
antes ela sumia justamente para quem ainda não tinha nada, e não havia por onde
começar. As ações somem quando o animal sai do rebanho; o histórico continua
legível.

- Domínio: `breedingsAwaitingDiagnosis` e `hasCalvedSince`
  (`lib/domain/reproduction.ts`), com testes. O segundo encerra a previsão de
  parto quando o bezerro já nasceu.
- API: `POST /animals/:earTag/breedings` · `/diagnoses` · `/calvings`
  (`lib/api/services/reproduction.ts`). O diagnóstico é _upsert_ por cobertura —
  repetir o exame corrige o resultado. O parto cadastra o bezerro na **mesma
  transação** (nascimento na data do parto, raça e lote da mãe, peso opcional
  vira a primeira pesagem); brinco duplicado devolve 409 e reverte tudo.
- UI: `RegisterBreedingDialog`, `RegisterDiagnosisDialog` e
  `RegisterCalvingDialog` em `components/animal/`.

Ficou de fora, de propósito: tela de reprodução no menu (matrizes esperando DG,
previsão de partos, taxa de prenhez), edição e exclusão de registros
(append-only, como as pesagens) e testes da camada de serviço — que é o item 5.

## 2. Sede no mapa — feito

Os contornos das invernadas já podem ser desenhados, redesenhados, apagados ou
informados por coordenadas. A sede agora é gravada pela UI: "Definir sede aqui"
na barra do mapa salva o centro e o zoom atuais em `farm.headquarters`
(`headquarters_lat`, `headquarters_lng`, `headquarters_zoom`), e o mapa reabre
nessa vista. Sem sede, ele continua ajustando aos contornos desenhados e, sem
nenhum, cai no centro padrão de Uberaba.

A sede tem rota própria, `PUT /farm/headquarters` (objeto substitui, null
limpa), separada de `PUT /farm`: ela pertence a Lotes e Mapa e os dados
cadastrais à Fazenda, e cada área é liberada à parte. Falta só um botão para
limpar a sede pela UI.

## 3. ~~Multi-fazenda — só no backend~~ ✅ feito em 12/09/2026

O dono convida por e-mail em Configurações > Equipe — nada é enviado; a pessoa
aceita ao entrar no MeuBov com aquele e-mail — e dá a cada membro um nível por
área (Nada, Ver ou Editar) a partir dos papéis Gerente, Vaqueiro e Consultor.
O servidor confere o nível em toda rota (`lib/api/permissions/routeRequirements.ts`)
e tira os valores em R$ de quem não tem Financeiro. Conta nova com convite
pendente cai em `/convites` sem ganhar fazenda vazia, e o celular ganhou a troca
de fazenda no "Mais".

Desde 13/09/2026 a troca de fazenda também cria uma nova (nome, município e,
se quiser, as raças, categorias e protocolos da fazenda aberta), e
Configurações > Fazendas lista todas as fazendas da conta: o dono exclui a sua,
menos a última. A exclusão é lógica (`farm.deleted_at`) e some para todos na
hora. Uma fazenda sem animais mostra Primeiros passos em Configurações, com
um aviso no Painel.

Ficou de fora: limite de usuários e de fazendas por plano, envio e verificação
de e-mail, transferência de dono, histórico de quem mudou o quê, mover animais
entre fazendas e restaurar uma fazenda excluída pela tela.

## 4. Autenticação incompleta

Não existe "esqueci a senha" / redefinição, verificação de e-mail, troca de
senha, edição de perfil nem exclusão de conta (`lib/auth/`, `components/auth/`).
A coluna `user.image` (`lib/db/schema.ts:450`) existe e não é usada — sem avatar.

## 5. Cobertura da API incompleta

Há teste dos helpers isolados, mas as transações de `lib/api/services/*`, o
escopo por `farm_id` e os locks do manejo ainda não são exercitados contra um
Postgres real. Também não há testes de ponta a ponta.

## 6. Sem telas de erro

Nenhum `error.tsx`, `not-found.tsx` ou `loading.tsx` em qualquer rota. Qualquer
exceção cai na tela padrão do Next.

## 7. Sem exportação

Nada de CSV, PDF ou impressão em rebanho, financeiro ou calendário.

## 8. Sem PWA / offline

O README posiciona a entrada de dados "no celular, em campo", mas não há
manifest, service worker nem fila offline.

## 9. Sem foto do animal

Nem coluna, nem upload, nem exibição.

## 10. Página de preview em produção

`app/preview/loading/page.tsx` é ferramenta de desenvolvimento e vai junto no
bundle de produção.

---

## Dívida de documentação

- A árvore de pastas do README lista `(auth)/ login/ signup/`. Esses diretórios
  não existem mais — o login vive no `AuthDialog` da landing, e `proxy.ts` só
  redireciona as URLs antigas.
