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

## 2. Sede no mapa

Os contornos das invernadas já podem ser desenhados, redesenhados, apagados ou
informados por coordenadas. Ainda falta definir `farm.headquarters` pela UI;
sem sede nem contorno, o mapa cai no centro padrão de Uberaba.

## 3. Multi-fazenda — só no backend

`farm_users`, os papéis `owner`/`member` e o cabeçalho `x-farm-id` funcionam no
servidor (`lib/api/plugins/farm.ts`). Falta tudo na UI: seletor de fazenda,
criar uma segunda fazenda, convidar membro, listar membros. O papel é gravado
mas nunca usado para permissão — hoje `member` e `owner` podem o mesmo.

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
