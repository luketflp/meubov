import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { deleteBlobsQuietly, vercelBlobStore, type BlobStore } from "@/lib/api/blob";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteAttachmentUseCaseProps {
  farmId: number;
  id: string;
}

type CurrUseCase = _UseCase<DeleteAttachmentUseCaseProps, boolean>;

/** Removes an anexo of the farm and then its file; false when it is not there. */
export class DeleteAttachmentUseCase implements CurrUseCase {
  private repository: RepositoryType;
  private blob: BlobStore;

  constructor(repo: RepositoryType = db, blob: BlobStore = vercelBlobStore) {
    __throwOnBrowser("DeleteAttachmentUseCase.constructor");
    this.repository = repo;
    this.blob = blob;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id }) => {
    const rows = await this.repository
      .delete(attachments)
      .where(and(eq(attachments.farmId, farmId), eq(attachments.id, id)))
      .returning({ pathname: attachments.pathname });
    if (rows.length === 0) return false;
    await deleteBlobsQuietly(this.blob, rows.map((row) => row.pathname));
    return true;
  };
}
