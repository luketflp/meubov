import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { toAttachment } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Attachment } from "@/lib/types";

interface ListAttachmentsUseCaseProps {
  farmId: number;
  expenseId: string;
}

type CurrUseCase = _UseCase<ListAttachmentsUseCaseProps, Attachment[]>;

/** The anexos of one lançamento of the farm, oldest first. */
export class ListAttachmentsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ListAttachmentsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, expenseId }) => {
    const rows = await this.repository
      .select()
      .from(attachments)
      .where(and(eq(attachments.farmId, farmId), eq(attachments.expenseId, expenseId)))
      .orderBy(asc(attachments.createdAt), asc(attachments.id));
    return rows.map(toAttachment);
  };
}
