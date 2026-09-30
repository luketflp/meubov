/**
 * Contas bancárias — contas correntes, caixa and cartões with their saldo
 * inicial — the transferências between them, and the conta of a venda or
 * compra. Reading them is the herd load; every route here writes.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { AddBankAccountUseCase } from "./useCases/AddBankAccount.useCase";
import { AddTransferUseCase } from "./useCases/AddTransfer.useCase";
import { ArchiveBankAccountUseCase } from "./useCases/ArchiveBankAccount.useCase";
import { DeleteBankAccountUseCase } from "./useCases/DeleteBankAccount.useCase";
import { DeleteTransferUseCase } from "./useCases/DeleteTransfer.useCase";
import { SetMovementBankAccountUseCase } from "./useCases/SetMovementBankAccount.useCase";
import { UpdateBankAccountUseCase } from "./useCases/UpdateBankAccount.useCase";
import { UpdateTransferUseCase } from "./useCases/UpdateTransfer.useCase";
import {
  ArchiveBankAccountBody,
  MovementBankAccountBody,
  NewBankAccountBody,
  NewTransferBody,
  UpdateBankAccountBody,
  UpdateTransferBody,
} from "./schemas/bankAccount.schema";

export const bankAccountsController = new Elysia()
  .use(farmPlugin)
  .post(
    "/bank-accounts",
    async ({ farmId, body, status }) => {
      const result = await new AddBankAccountUseCase().run({ farmId, ...body });
      if (typeof result === "string") return status(400, { error: result });
      return result;
    },
    { farm: true, body: NewBankAccountBody }
  )
  .patch(
    "/bank-accounts/:id",
    async ({ farmId, params, body, status }) => {
      const result = await new UpdateBankAccountUseCase().run({ farmId, id: params.id, patch: body });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "main_required" || result === "archived") return status(409, { error: result });
      if (typeof result === "string") return status(400, { error: result });
      return result;
    },
    { farm: true, body: UpdateBankAccountBody }
  )
  .post(
    "/bank-accounts/:id/archive",
    async ({ farmId, params, body, status }) => {
      const result = await new ArchiveBankAccountUseCase().run({ farmId, id: params.id, archived: body.archived });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "is_main") return status(409, { error: result });
      return result;
    },
    { farm: true, body: ArchiveBankAccountBody }
  )
  .delete(
    "/bank-accounts/:id",
    async ({ farmId, params, status }) => {
      const result = await new DeleteBankAccountUseCase().run({ farmId, id: params.id });
      if (result === "not_found") return status(404, { error: result });
      if (result !== "deleted") return status(409, { error: result });
      return { id: params.id };
    },
    { farm: true }
  )
  .post(
    "/transfers",
    async ({ farmId, user, body, status }) => {
      const result = await new AddTransferUseCase().run({ farmId, userId: user.id, ...body });
      if (result === "account_not_found") return status(404, { error: result });
      if (typeof result === "string") return status(400, { error: result });
      return result;
    },
    { farm: true, body: NewTransferBody }
  )
  .patch(
    "/transfers/:id",
    async ({ farmId, params, body, status }) => {
      const result = await new UpdateTransferUseCase().run({ farmId, id: params.id, patch: body });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "account_not_found") return status(404, { error: result });
      if (typeof result === "string") return status(400, { error: result });
      return result;
    },
    { farm: true, body: UpdateTransferBody }
  )
  .delete(
    "/transfers/:id",
    async ({ farmId, params, status }) => {
      const removed = await new DeleteTransferUseCase().run({ farmId, id: params.id });
      if (!removed) return status(404, { error: "not_found" });
      return { id: params.id };
    },
    { farm: true }
  )
  .patch(
    "/movements/:id/bank-account",
    async ({ farmId, params, body, status }) => {
      const result = await new SetMovementBankAccountUseCase().run({
        farmId,
        id: params.id,
        bankAccountId: body.bankAccountId,
      });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "invalid_bank_account") return status(400, { error: result });
      return result;
    },
    { farm: true, body: MovementBankAccountBody }
  );
