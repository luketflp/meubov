/**
 * Anexos of the lançamentos: photos and PDFs in a private Vercel Blob store.
 * The browser uploads straight to Blob with a token from POST
 * /attachments/upload-token, then registers the file here; every read streams
 * through GET /attachments/:id. Writes need Financeiro edit, reads view
 * (routeRequirements.ts).
 */
import { Elysia } from "elysia";

import { vercelBlobStore } from "@/lib/api/blob";
import { farmPlugin } from "@/lib/api/plugins/farm";

import { DeleteAttachmentUseCase } from "./useCases/Delete.useCase";
import { IssueUploadTokenUseCase } from "./useCases/IssueUploadToken.useCase";
import { ListAttachmentsUseCase } from "./useCases/List.useCase";
import { OpenAttachmentUseCase } from "./useCases/Open.useCase";
import { RegisterAttachmentUseCase } from "./useCases/Register.useCase";
import { RegisterAttachmentBody, UploadTokenBody } from "./schemas/attachment.schema";

export const attachmentsController = new Elysia()
  .use(farmPlugin)
  .get("/attachments/status", () => ({ enabled: vercelBlobStore.enabled() }), { farm: true })
  .post(
    "/attachments/upload-token",
    async ({ farmId, body, status }) => {
      const result = await new IssueUploadTokenUseCase().run({
        farmId,
        pathname: body.payload.pathname,
      });
      if (result === "disabled") return status(503, { error: result });
      if (result === "bad_path") return status(400, { error: result });
      if (result === "not_found") return status(404, { error: result });
      if (result === "too_many") return status(409, { error: result });
      // The shape @vercel/blob/client's upload() reads back.
      return { type: "blob.generate-client-token" as const, clientToken: result.clientToken };
    },
    { farm: true, body: UploadTokenBody }
  )
  .get(
    "/expenses/:id/attachments",
    ({ farmId, params }) => new ListAttachmentsUseCase().run({ farmId, expenseId: params.id }),
    { farm: true }
  )
  .post(
    "/expenses/:id/attachments",
    async ({ farmId, user, params, body, status }) => {
      const result = await new RegisterAttachmentUseCase().run({
        farmId,
        userId: user.id,
        expenseId: params.id,
        pathname: body.pathname,
        fileName: body.fileName,
      });
      if (result === "disabled") return status(503, { error: result });
      if (result === "not_found" || result === "missing_blob") return status(404, { error: result });
      if (result === "too_many" || result === "duplicate") return status(409, { error: result });
      if (result === "bad_path" || result === "too_large" || result === "bad_type") {
        return status(400, { error: result });
      }
      return result;
    },
    { farm: true, body: RegisterAttachmentBody }
  )
  .get(
    "/attachments/:id",
    async ({ farmId, params, status }) => {
      const file = await new OpenAttachmentUseCase().run({ farmId, id: params.id });
      if (file === "disabled") return status(503, { error: file });
      if (!file) return status(404, { error: "not_found" });
      // No content-length: the body streams as it comes from the store.
      return new Response(file.body, {
        headers: {
          "content-type": file.contentType,
          "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      });
    },
    { farm: true }
  )
  .delete(
    "/attachments/:id",
    async ({ farmId, params, status }) => {
      const removed = await new DeleteAttachmentUseCase().run({ farmId, id: params.id });
      if (!removed) return status(404, { error: "not_found" });
      return { id: params.id };
    },
    { farm: true }
  );
