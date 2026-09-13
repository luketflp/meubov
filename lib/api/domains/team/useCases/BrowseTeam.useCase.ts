import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { farmInvites, farmUsers, user, type FarmInviteRow } from "@/lib/db/schema";
import { inviteState, type ListedInviteState } from "@/lib/domain/invites";
import {
  canGrant,
  canManage,
  parsePermissions,
  resolvePermissions,
  type FarmRole,
  type ManageVerdict,
  type MemberPreset,
  type Permissions,
} from "@/lib/domain/permissions";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

/** Whoever is looking at or changing the team. */
export interface TeamActor {
  userId: string;
  role: FarmRole;
  permissions: Permissions;
}

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: FarmRole;
  preset: MemberPreset | null;
  permissions: Permissions;
  joinedAt: string;
  isYou: boolean;
  /** Whether the caller may change or remove this member, and why not. */
  manage: ManageVerdict;
}

export interface TeamInvite {
  id: number;
  email: string;
  preset: MemberPreset;
  permissions: Permissions;
  state: ListedInviteState;
  expiresAt: string;
  respondedAt: string | null;
}

export interface TeamView {
  members: TeamMember[];
  invites: TeamInvite[];
}

export function toTeamInvite(row: FarmInviteRow, state: ListedInviteState): TeamInvite {
  return {
    id: row.id,
    email: row.email,
    preset: row.preset,
    permissions: parsePermissions(row.permissions),
    state,
    expiresAt: row.expiresAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString() ?? null,
  };
}

interface BrowseTeamUseCaseProps {
  farmId: number;
  actor: TeamActor;
  now: Date;
}

type CurrUseCase = _UseCase<BrowseTeamUseCaseProps, TeamView>;

/**
 * The Equipe page: every member with the Dono first, and the convites the
 * owner's list shows — pending, expired and declined, the latest one per
 * e-mail. Accepted and canceled convites stay in the table for history only.
 */
export class BrowseTeamUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("BrowseTeamUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, actor, now }) => {
    const [memberRows, inviteRows] = await Promise.all([
      this.repository
        .select({
          userId: farmUsers.userId,
          role: farmUsers.role,
          preset: farmUsers.preset,
          permissions: farmUsers.permissions,
          joinedAt: farmUsers.createdAt,
          name: user.name,
          email: user.email,
        })
        .from(farmUsers)
        .innerJoin(user, eq(user.id, farmUsers.userId))
        .where(eq(farmUsers.farmId, farmId))
        .orderBy(asc(farmUsers.createdAt)),
      this.repository
        .select()
        .from(farmInvites)
        .where(
          and(eq(farmInvites.farmId, farmId), inArray(farmInvites.status, ["pending", "declined"]))
        )
        .orderBy(desc(farmInvites.createdAt)),
    ]);

    const members = memberRows
      .map((row): TeamMember => {
        const permissions = resolvePermissions(row, false);
        return {
          userId: row.userId,
          name: row.name,
          email: row.email,
          role: row.role,
          preset: row.preset,
          permissions,
          joinedAt: row.joinedAt.toISOString(),
          isYou: row.userId === actor.userId,
          manage: canManage(actor, { userId: row.userId, role: row.role, permissions }),
        };
      })
      .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"));

    const seen = new Set<string>();
    const invites: TeamInvite[] = [];
    for (const row of inviteRows) {
      if (seen.has(row.email)) continue;
      seen.add(row.email);
      const state = inviteState(row, now);
      if (state !== null) invites.push(toTeamInvite(row, state));
    }

    // The Dono sees every convite; anyone else only the ones within their own
    // grant ceiling — otherwise a Personalizado member could read off, say, a
    // pending Gerente convite's e-mail and race it to sign-up.
    const visible =
      actor.role === "owner"
        ? invites
        : invites.filter((invite) => canGrant(actor.permissions, invite.permissions).ok);

    return { members, invites: visible };
  };
}
