import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { vercelBlobStore, type BlobStore } from "@/lib/api/blob";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface OpenAttachmentUseCaseProps {
  farmId: number;
  id: string;
}

interface OpenedAttachment {
  fileName: string;
  contentType: string;
  body: ReadableStream<Uint8Array>;
}

/** `disabled` without a Blob token; null when the anexo is not on this farm or its file is gone. */
type CurrUseCase = _UseCase<OpenAttachmentUseCaseProps, OpenedAttachment | "disabled" | null>;

/** The bytes of an anexo of the caller's farm, read from the private store. */
export class OpenAttachmentUseCase implements CurrUseCase {
  private repository: RepositoryType;
  private blob: BlobStore;

  constructor(repo: RepositoryType = db, blob: BlobStore = vercelBlobStore) {
    __throwOnBrowser("OpenAttachmentUseCase.constructor");
    this.repository = repo;
    this.blob = blob;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id }) => {
    if (!this.blob.enabled()) return "disabled";
    const [row] = await this.repository
      .select()
      .from(attachments)
      .where(and(eq(attachments.farmId, farmId), eq(attachments.id, id)))
      .limit(1);
    if (!row) return null;
    const body = await this.blob.stream(row.pathname);
    if (!body) return null;
    return { fileName: row.fileName, contentType: row.contentType, body };
  };
}
