# Relatórios financeiros — plan

Spec: `docs/superpowers/specs/2026-10-07-relatorios-financeiros-design.md`. Inline on `main`, test-first for the
pure parts, one commit at the end.

1. `shiftPeriodByMonths`: a window from a 1st to a month's last day moves by whole months. Test in
   `lib/domain/__tests__/period.test.ts` first.
2. `lib/reports/groups.ts` + `lib/reports/__tests__/groups.test.ts`: `groupsReport` (receitas by conta, despesas by
   grupo with contas, capital, totals, saldo; competência and caixa).
3. `lib/reports/bankStatement.ts` + `lib/reports/__tests__/bankStatement.test.ts`: `bankStatement` (sections,
   saldo anterior, lines with emissão/vencto/documento/histórico/conta do plano, transferências, cartão, archived
   conta, one conta or all) and `statementDate` (dd/mm, dd/mm/aa off the window's year).
4. `components/reports/tables.ts`: `groupsRevenueTable`, `groupsExpenseTable`, `groupsCapitalTable`,
   `bankSummaryTable`, `bankStatementTable`; tests in `components/reports/__tests__/tables.test.ts`.
5. `PrintTable` `subRows`; `GroupsSheet.tsx`, `BankStatementSheet.tsx`.
6. Pages `app/(app)/relatorios/grupos/page.tsx` and `extrato/page.tsx` (RequireAccess finance view), DocCards on
   `/relatorios`, route requirements and snapshots if the API route list is touched (it is not).
7. Gates: tsc, eslint, vitest, `next build --webpack`; smoke on tmpfs Postgres with seeded lançamentos, a venda,
   a transferência and a cartão; screenshots of both sheets.
