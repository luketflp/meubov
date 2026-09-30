/**
 * Extratos and conciliação: import an OFX or CSV into a conta corrente, read
 * one import with its lines, and decide each line — pair it, create the
 * lançamento, make it a transferência, ignore it, or undo.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { ConfirmHighUseCase } from "./useCases/ConfirmHigh.useCase";
import { GetImportUseCase } from "./useCases/GetImport.useCase";
import { ImportStatementUseCase } from "./useCases/ImportStatement.useCase";
import { ResolveLineUseCase, type LineAction, type ResolveRefusal } from "./useCases/ResolveLine.useCase";
import {
  ConfirmHighBody,
  CreateFromLineBody,
  IgnoreLineBody,
  ImportStatementBody,
  MatchBody,
  TransferFromLineBody,
} from "./schemas/statement.schema";

const REFUSAL_STATUS: Record<ResolveRefusal, 400 | 404 | 409> = {
  not_found: 404,
  target_not_found: 404,
  not_pending: 409,
  wrong_side: 400,
  paid_by_other: 409,
  already_paired: 409,
  same_account: 400,
  card_from: 400,
  amount_differs: 409,
  due_before_date: 400,
  invalid_bank_account: 400,
};

const resolveLine = (farmId: number, userId: string, lineId: string, action: LineAction) =>
  new ResolveLineUseCase().run({ farmId, userId, lineId, action });

export const statementsController = new Elysia()
  .use(farmPlugin)
  .post(
    "/bank-accounts/:id/imports",
    async ({ farmId, user, params, body, status }) => {
      const result = await new ImportStatementUseCase().run({
        farmId,
        userId: user.id,
        bankAccountId: params.id,
        ...body,
      });
      if (result === "not_found") return status(404, { error: result });
      if (result === "nothing_new") return status(409, { error: result });
      if (typeof result === "string") return status(400, { error: result });
      return result;
    },
    { farm: true, body: ImportStatementBody }
  )
  .get(
    "/imports/:id",
    async ({ farmId, params, status }) => {
      const view = await new GetImportUseCase().run({ farmId, id: params.id });
      if (!view) return status(404, { error: "not_found" });
      return view;
    },
    { farm: true }
  )
  .post(
    "/imports/:id/confirm-high",
    ({ farmId, user, params, body }) =>
      new ConfirmHighUseCase().run({ farmId, userId: user.id, importId: params.id, pairs: body.pairs }),
    { farm: true, body: ConfirmHighBody }
  )
  .post(
    "/statement-lines/:id/match",
    async ({ farmId, user, params, body, status }) => {
      const result = await resolveLine(farmId, user.id, params.id, { type: "match", target: body });
      if (typeof result === "string") return status(REFUSAL_STATUS[result], { error: result });
      return result;
    },
    { farm: true, body: MatchBody }
  )
  .post(
    "/statement-lines/:id/create",
    async ({ farmId, user, params, body, status }) => {
      const result = await resolveLine(farmId, user.id, params.id, { type: "create", entry: body });
      if (typeof result === "string") return status(REFUSAL_STATUS[result], { error: result });
      return result;
    },
    { farm: true, body: CreateFromLineBody }
  )
  .post(
    "/statement-lines/:id/transfer",
    async ({ farmId, user, params, body, status }) => {
      const result = await resolveLine(farmId, user.id, params.id, { type: "transfer", ...body });
      if (typeof result === "string") return status(REFUSAL_STATUS[result], { error: result });
      return result;
    },
    { farm: true, body: TransferFromLineBody }
  )
  .post(
    "/statement-lines/:id/ignore",
    async ({ farmId, user, params, body, status }) => {
      const result = await resolveLine(farmId, user.id, params.id, { type: "ignore", reason: body.reason });
      if (typeof result === "string") return status(REFUSAL_STATUS[result], { error: result });
      return result;
    },
    { farm: true, body: IgnoreLineBody }
  )
  .post(
    "/statement-lines/:id/undo",
    async ({ farmId, user, params, status }) => {
      const result = await resolveLine(farmId, user.id, params.id, { type: "undo" });
      if (typeof result === "string") return status(REFUSAL_STATUS[result], { error: result });
      return result;
    },
    { farm: true }
  );
