/** Request schemas for the anexos of a lançamento. */

import { t } from "elysia";

/**
 * What `upload()` of @vercel/blob/client posts to its `handleUploadUrl` to ask
 * for a client token. Only the token request is accepted: the "upload
 * completed" callback is not used (the client registers the anexo itself).
 */
export const UploadTokenBody = t.Object({
  type: t.Literal("blob.generate-client-token"),
  payload: t.Object({
    pathname: t.String({ minLength: 1, maxLength: 400 }),
    clientPayload: t.Optional(t.Nullable(t.String())),
    multipart: t.Optional(t.Boolean()),
  }),
});

/** Body of POST /expenses/:id/attachments, after the browser uploaded the file. */
export const RegisterAttachmentBody = t.Object({
  pathname: t.String({ minLength: 1, maxLength: 400 }),
  fileName: t.String({ minLength: 1, maxLength: 200 }),
});
