/** browseTeam: members with what the caller may do to each, and the listed convites. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import { BrowseTeamUseCase } from "../BrowseTeam.useCase";

const now = new Date("2026-09-12T15:00:00Z");
const joined = new Date("2026-08-14T12:00:00Z");

beforeEach(() => {
  state.selectResults = [];
});

describe("browseTeam", () => {
  it("lists the Dono first and says who the caller may manage", async () => {
    state.selectResults = [
      [
        { userId: "u-joao", role: "member", preset: "vaqueiro", permissions: PRESETS.vaqueiro, joinedAt: joined, name: "João", email: "joao@gmail.com" },
        { userId: "u-owner", role: "owner", preset: null, permissions: null, joinedAt: joined, name: "Lucas", email: "lucas@maranata.com.br" },
      ],
      [],
    ];
    const view = await new BrowseTeamUseCase().run({
      farmId: 7,
      actor: { userId: "u-owner", role: "owner", permissions: FULL_PERMISSIONS },
      now,
    });
    expect(view.members.map((m) => m.userId)).toEqual(["u-owner", "u-joao"]);
    expect(view.members[0]).toMatchObject({ isYou: true, permissions: FULL_PERMISSIONS, manage: { ok: false, reason: "owner" } });
    expect(view.members[1]).toMatchObject({ isYou: false, joinedAt: "2026-08-14T12:00:00.000Z", manage: { ok: true } });
  });

  it("keeps the latest convite per e-mail and derives expiry", async () => {
    state.selectResults = [
      [],
      [
        { id: 9, farmId: 7, email: "pedro@gmail.com", preset: "vaqueiro", permissions: PRESETS.vaqueiro, status: "pending", invitedByUserId: null, createdAt: now, expiresAt: new Date("2026-09-02T12:00:00Z"), respondedAt: null },
        { id: 8, farmId: 7, email: "rafael@agrocampo.com.br", preset: "consultor", permissions: PRESETS.consultor, status: "declined", invitedByUserId: null, createdAt: now, expiresAt: new Date("2026-09-10T12:00:00Z"), respondedAt: new Date("2026-09-08T12:00:00Z") },
        { id: 2, farmId: 7, email: "pedro@gmail.com", preset: "vaqueiro", permissions: PRESETS.vaqueiro, status: "declined", invitedByUserId: null, createdAt: joined, expiresAt: joined, respondedAt: joined },
      ],
    ];
    const view = await new BrowseTeamUseCase().run({
      farmId: 7,
      actor: { userId: "u-owner", role: "owner", permissions: FULL_PERMISSIONS },
      now,
    });
    expect(view.invites.map((i) => [i.id, i.state])).toEqual([
      [9, "expired"],
      [8, "declined"],
    ]);
    expect(view.invites[1].respondedAt).toBe("2026-09-08T12:00:00.000Z");
  });

  it("hides a convite above the actor's grant ceiling, but the Dono sees it", async () => {
    const gerenteInvite = {
      id: 5,
      farmId: 7,
      email: "gerente@fazenda.com",
      preset: "gerente",
      permissions: PRESETS.gerente,
      status: "pending",
      invitedByUserId: null,
      createdAt: now,
      expiresAt: new Date("2026-09-19T12:00:00Z"),
      respondedAt: null,
    };

    state.selectResults = [[], [gerenteInvite]];
    const asPersonalizado = await new BrowseTeamUseCase().run({
      farmId: 7,
      actor: { userId: "u-marta", role: "member", permissions: PRESETS.consultor },
      now,
    });
    expect(asPersonalizado.invites).toEqual([]);

    state.selectResults = [[], [gerenteInvite]];
    const asOwner = await new BrowseTeamUseCase().run({
      farmId: 7,
      actor: { userId: "u-owner", role: "owner", permissions: FULL_PERMISSIONS },
      now,
    });
    expect(asOwner.invites.map((i) => i.id)).toEqual([5]);
  });
});
