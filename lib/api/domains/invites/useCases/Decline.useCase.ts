import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { farmInvites } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeclineInviteUseCaseProps {
  inviteId: number;
  email: string;
  now: Date;
}

type CurrUseCase = _UseCase<DeclineInviteUseCaseProps, boolean>;

/** Refuses a convite; the owner's list then shows it as "Recusado". */
export class DeclineInviteUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeclineInviteUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ inviteId, email, now }) => {
    const rows = await this.repository
      .update(farmInvites)
      .set({ status: "declined", respondedAt: now })
      .where(
        and(
          eq(farmInvites.id, inviteId),
          eq(farmInvites.email, email),
          eq(farmInvites.status, "pending")
        )
      )
      .returning({ id: farmInvites.id });
    return rows.length > 0;
  };
}
