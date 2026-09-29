import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { attachments, expenses } from "@/lib/db/schema";
import { toAttachment } from "@/lib/api/mappers";
import { deleteBlobsQuietly, vercelBlobStore, type BlobStore } from "@/lib/api/blob";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  isAttachmentType,
  parseAttachmentPathname,
} from "@/lib/domain/attachments";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Attachment } from "@/lib/types";

interface RegisterAttachmentUseCaseProps {
  farmId: number;
  userId: string;
  expenseId: string;
  pathname: string;
  fileName: string;
}

type RegisterAttachmentUseCaseResponse =
  | Attachment
  | "disabled"
  | "bad_path"
  | "not_found"
  | "too_many"
  | "duplicate"
  | "missing_blob"
  | "too_large"
  | "bad_type";

type CurrUseCase = _UseCase<RegisterAttachmentUseCaseProps, RegisterAttachmentUseCaseResponse>;

/**
 * Records a file the browser already uploaded. The pathname must sit in this
 * farm's folder of this lançamento, and the stored blob (not what the client
 * says) must be at most 5 MB of an allowed type; a refused blob is deleted.
 * `duplicate` when the pathname is registered already.
 */
export class RegisterAttachmentUseCase implements CurrUseCase {
  private repository: RepositoryType;
  private blob: BlobStore;

  constructor(repo: RepositoryType = db, blob: BlobStore = vercelBlobStore) {
    __throwOnBrowser("RegisterAttachmentUseCase.constructor");
    this.repository = repo;
    this.blob = blob;
  }

  public run: CurrUseCase["run"] = async ({ farmId, userId, expenseId, pathname, fileName }) => {
    if (!this.blob.enabled()) return "disabled";
    const target = parseAttachmentPathname(pathname);
    if (!target || target.farmId !== farmId || target.expenseId !== expenseId) return "bad_path";

    const [expense] = await this.repository
      .select({ id: expenses.id })
      .from(expenses)
      .where(and(eq(expenses.farmId, farmId), eq(expenses.id, expenseId)))
      .limit(1);
    if (!expense) {
      await deleteBlobsQuietly(this.blob, [pathname]);
      return "not_found";
    }

    // ponytail: count then insert, not locked; concurrent uploads can pass 10 by a few. Lock the lançamento row if that matters.
    const [{ total }] = await this.repository
      .select({ total: count() })
      .from(attachments)
      .where(and(eq(attachments.farmId, farmId), eq(attachments.expenseId, expenseId)));
    if (total >= MAX_ATTACHMENTS) {
      await deleteBlobsQuietly(this.blob, [pathname]);
      return "too_many";
    }

    const file = await this.blob.head(pathname);
    if (!file) return "missing_blob";
    if (file.size > MAX_ATTACHMENT_BYTES || !isAttachmentType(file.contentType)) {
      await deleteBlobsQuietly(this.blob, [pathname]);
      return file.size > MAX_ATTACHMENT_BYTES ? "too_large" : "bad_type";
    }

    let row: typeof attachments.$inferSelect;
    try {
      [row] = await this.repository
        .insert(attachments)
        .values({
          id: randomUUID(),
          farmId,
          expenseId,
          pathname,
          fileName: fileName.trim().slice(0, 200) || "anexo",
          contentType: file.contentType,
          sizeBytes: file.size,
          createdBy: userId,
        })
        .returning();
    } catch (error) {
      // Registered already (a retried request): the blob is that row's, keep it.
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
    return toAttachment(row);
  };
}
