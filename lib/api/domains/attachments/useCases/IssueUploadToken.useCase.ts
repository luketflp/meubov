import { and, count, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { attachments, expenses } from "@/lib/db/schema";
import { vercelBlobStore, type BlobStore } from "@/lib/api/blob";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import {
  ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  parseAttachmentPathname,
} from "@/lib/domain/attachments";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface IssueUploadTokenUseCaseProps {
  farmId: number;
  pathname: string;
}

/**
 * `disabled` without a Blob token; `bad_path` outside
 * `farms/<farmId>/expenses/<id>/`; `not_found` when the lançamento is not on
 * this farm; `too_many` at 10 anexos.
 */
type IssueUploadTokenUseCaseResponse =
  | { clientToken: string }
  | "disabled"
  | "bad_path"
  | "not_found"
  | "too_many";

type CurrUseCase = _UseCase<IssueUploadTokenUseCaseProps, IssueUploadTokenUseCaseResponse>;

/** Signs a client token for one file of one lançamento of the caller's farm. */
export class IssueUploadTokenUseCase implements CurrUseCase {
  private repository: RepositoryType;
  private blob: BlobStore;

  constructor(repo: RepositoryType = db, blob: BlobStore = vercelBlobStore) {
    __throwOnBrowser("IssueUploadTokenUseCase.constructor");
    this.repository = repo;
    this.blob = blob;
  }

  public run: CurrUseCase["run"] = async ({ farmId, pathname }) => {
    if (!this.blob.enabled()) return "disabled";
    const target = parseAttachmentPathname(pathname);
    if (!target || target.farmId !== farmId) return "bad_path";

    const [expense] = await this.repository
      .select({ id: expenses.id })
      .from(expenses)
      .where(and(eq(expenses.farmId, farmId), eq(expenses.id, target.expenseId)))
      .limit(1);
    if (!expense) return "not_found";

    const [{ total }] = await this.repository
      .select({ total: count() })
      .from(attachments)
      .where(and(eq(attachments.farmId, farmId), eq(attachments.expenseId, target.expenseId)));
    if (total >= MAX_ATTACHMENTS) return "too_many";

    const clientToken = await this.blob.clientToken(pathname, {
      maximumSizeInBytes: MAX_ATTACHMENT_BYTES,
      allowedContentTypes: ATTACHMENT_TYPES,
    });
    return { clientToken };
  };
}
