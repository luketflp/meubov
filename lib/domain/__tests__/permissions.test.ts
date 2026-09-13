import { describe, expect, it } from "vitest";
import {
  FLOORS,
  FULL_PERMISSIONS,
  PRESETS,
  accessGroups,
  accessSummary,
  can,
  canGrant,
  canManage,
  closestPreset,
  joinPt,
  parsePermissions,
  presetFor,
  resolvePermissions,
  roleLabel,
  type Permissions,
} from "@/lib/domain/permissions";

const consultor = PRESETS.consultor;

describe("PRESETS", () => {
  it("holds the levels of the spec's table", () => {
    expect(PRESETS.gerente).toEqual(FULL_PERMISSIONS);
    expect(PRESETS.vaqueiro).toEqual({
      herd: "edit",
      manejo: "edit",
      reproduction: "edit",
      sanitary: "edit",
      lots: "edit",
      finance: "none",
      farm: "view",
      team: "none",
    });
    expect(PRESETS.consultor).toEqual({
      herd: "view",
      manejo: "view",
      reproduction: "view",
      sanitary: "view",
      lots: "view",
      finance: "view",
      farm: "view",
      team: "none",
    });
  });

  it("never sits below a floor", () => {
    for (const preset of Object.values(PRESETS)) {
      expect(parsePermissions(preset)).toEqual(preset);
    }
  });
});

describe("parsePermissions", () => {
  it("fills a missing area with its floor", () => {
    expect(parsePermissions({ herd: "edit" })).toEqual({ ...FLOORS, herd: "edit" });
  });

  it("replaces an unknown value with the floor", () => {
    expect(parsePermissions({ finance: "admin", lots: 3 })).toEqual(FLOORS);
  });

  it("raises a level below the floor", () => {
    expect(parsePermissions({ herd: "none", finance: "none" })).toEqual(FLOORS);
  });

  it("reads null as the floors", () => {
    expect(parsePermissions(null)).toEqual(FLOORS);
  });
});

describe("resolvePermissions", () => {
  it("gives the Dono every area at edit", () => {
    expect(resolvePermissions({ role: "owner", permissions: null }, false)).toEqual(
      FULL_PERMISSIONS
    );
  });

  it("gives a superuser every area at edit", () => {
    expect(resolvePermissions({ role: "member", permissions: consultor }, true)).toEqual(
      FULL_PERMISSIONS
    );
  });

  it("parses a member's stored levels", () => {
    expect(resolvePermissions({ role: "member", permissions: consultor }, false)).toEqual(
      consultor
    );
  });
});

describe("can", () => {
  it("compares levels in order", () => {
    expect(can(consultor, "herd", "view")).toBe(true);
    expect(can(consultor, "herd", "edit")).toBe(false);
    expect(can(consultor, "team", "view")).toBe(false);
    expect(can(consultor, "team", "none")).toBe(true);
  });
});

describe("presetFor", () => {
  it("names a matching preset", () => {
    expect(presetFor(PRESETS.vaqueiro)).toBe("vaqueiro");
    expect(presetFor(FULL_PERMISSIONS)).toBe("gerente");
  });

  it("calls anything else personalizado", () => {
    expect(presetFor({ ...consultor, sanitary: "edit" })).toBe("personalizado");
  });
});

describe("closestPreset", () => {
  it("picks the preset with the fewest differing areas", () => {
    expect(closestPreset({ ...consultor, reproduction: "edit", sanitary: "edit" })).toBe(
      "consultor"
    );
    expect(closestPreset({ ...PRESETS.vaqueiro, farm: "edit" })).toBe("vaqueiro");
  });
});

describe("canGrant", () => {
  const marta: Permissions = { ...FULL_PERMISSIONS, finance: "view" };

  it("allows levels at or below the actor's", () => {
    expect(canGrant(marta, { ...PRESETS.vaqueiro, finance: "view" })).toEqual({ ok: true });
  });

  it("names the first area over the ceiling", () => {
    expect(canGrant(marta, PRESETS.gerente)).toEqual({ ok: false, area: "finance" });
  });
});

describe("canManage", () => {
  const owner = { userId: "u-owner", role: "owner" as const, permissions: FULL_PERMISSIONS };
  const marta = {
    userId: "u-marta",
    role: "member" as const,
    permissions: { ...FULL_PERMISSIONS, finance: "view" as const },
  };
  const joao = { userId: "u-joao", role: "member" as const, permissions: PRESETS.vaqueiro };
  const roberto = { userId: "u-roberto", role: "member" as const, permissions: PRESETS.gerente };

  it("never manages the Dono", () => {
    expect(canManage(marta, owner)).toEqual({ ok: false, reason: "owner" });
  });

  it("never manages oneself", () => {
    expect(canManage(marta, marta)).toEqual({ ok: false, reason: "self" });
  });

  it("refuses a member holding more in any area", () => {
    expect(canManage(marta, roberto)).toEqual({ ok: false, reason: "above" });
  });

  it("manages a member at or below every level", () => {
    expect(canManage(marta, joao)).toEqual({ ok: true });
    expect(canManage(roberto, { ...roberto, userId: "u-other" })).toEqual({ ok: true });
  });

  it("lets the Dono manage anyone else", () => {
    expect(canManage(owner, roberto)).toEqual({ ok: true });
  });
});

describe("accessGroups", () => {
  it("splits the areas by level, in area order", () => {
    expect(accessGroups(PRESETS.vaqueiro)).toEqual({
      edit: ["herd", "manejo", "reproduction", "sanitary", "lots"],
      view: ["farm"],
      none: ["finance", "team"],
    });
  });
});

describe("joinPt", () => {
  it("joins with commas and a final e", () => {
    expect(joinPt(["Rebanho"])).toBe("Rebanho");
    expect(joinPt(["Rebanho", "Manejo"])).toBe("Rebanho e Manejo");
    expect(joinPt(["Rebanho", "Manejo", "Lotes e Mapa"])).toBe("Rebanho, Manejo e Lotes e Mapa");
  });
});

describe("accessSummary", () => {
  it("reads Acesso total for the Dono", () => {
    expect(accessSummary("owner", FULL_PERMISSIONS)).toBe("Acesso total");
  });

  it("reads Edita tudo when every area is at edit", () => {
    expect(accessSummary("member", PRESETS.gerente)).toBe("Edita tudo");
  });

  it("reads Vê tudo for a member who edits nothing", () => {
    expect(accessSummary("member", consultor)).toBe("Vê tudo · não edita");
  });

  it("names a hidden area on a viewer", () => {
    expect(accessSummary("member", { ...consultor, finance: "none" })).toBe(
      "Vê tudo · sem Financeiro"
    );
  });

  it("names one or two edited areas", () => {
    expect(
      accessSummary("member", { ...consultor, reproduction: "edit", sanitary: "edit" })
    ).toBe("Edita Reprodução e Sanitário · vê o resto");
  });

  it("counts more than two edited areas and names what is hidden", () => {
    expect(accessSummary("member", PRESETS.vaqueiro)).toBe("Edita 5 áreas · sem Financeiro");
    expect(accessSummary("member", { ...FULL_PERMISSIONS, finance: "view" })).toBe(
      "Edita 7 áreas"
    );
  });
});

describe("roleLabel", () => {
  it("reads Dono for the owner and the preset otherwise", () => {
    expect(roleLabel("owner", null)).toBe("Dono");
    expect(roleLabel("member", "vaqueiro")).toBe("Vaqueiro");
    expect(roleLabel("member", null)).toBe("Personalizado");
  });
});
