/** browseMyInvites: the convites waiting for the signed-in e-mail, and whether a farm exists. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRESETS } from "@/lib/domain/permissions";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
    wheres: [] as unknown[],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import type { SQL } from "drizzle-orm";
import { renderSql } from "@/lib/api/__tests__/dbStub";
import { BrowseMyInvitesUseCase } from "../BrowseMine.useCase";

const now = new Date("2026-09-12T15:00:00Z");

beforeEach(() => {
  state.selectResults = [];
  state.wheres = [];
});

describe("browseMyInvites", () => {
  it("serializes each convite and says the user has no farm yet", async () => {
    state.selectResults = [
      [
        {
          id: 3,
          farmId: 7,
          preset: "vaqueiro",
          permissions: { herd: "edit" },
          expiresAt: new Date("2026-09-18T15:00:00Z"),
          farmName: "Fazenda Maranata",
          municipality: "Nova Mutum",
          invitedByName: null,
        },
      ],
      [],
    ];
    const result = await new BrowseMyInvitesUseCase().run({
      userId: "u-zeca",
      email: "zeca@hotmail.com",
      now,
    });
    expect(result).toEqual({
      invites: [
        {
          id: 3,
          farmId: 7,
          preset: "vaqueiro",
          permissions: { ...PRESETS.consultor, herd: "edit", finance: "none" },
          expiresAt: "2026-09-18T15:00:00.000Z",
          farmName: "Fazenda Maranata",
          municipality: "Nova Mutum",
          invitedByName: null,
        },
      ],
      hasFarm: false,
    });
  });

  it("says the user has a farm when a membership exists", async () => {
    state.selectResults = [[], [{ farmId: 2 }]];
    const result = await new BrowseMyInvitesUseCase().run({ userId: "u", email: "u@x.com", now });
    expect(result).toEqual({ invites: [], hasFarm: true });
  });

  it("counts only live farms as having a farm", async () => {
    state.selectResults = [[], []];
    await new BrowseMyInvitesUseCase().run({ userId: "u-zeca", email: "zeca@hotmail.com", now });
    const membership = renderSql(state.wheres[1] as SQL);
    expect(membership.sql).toContain('"farm"."deleted_at" is null');
    expect(membership.params).toContain("u-zeca");
  });

  it("hides convites of a deleted farm", async () => {
    state.selectResults = [[], []];
    await new BrowseMyInvitesUseCase().run({ userId: "u-zeca", email: "zeca@hotmail.com", now });
    const invites = renderSql(state.wheres[0] as SQL);
    expect(invites.sql).toContain('"farm"."deleted_at" is null');
  });
});
