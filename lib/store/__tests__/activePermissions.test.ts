import { describe, expect, it } from "vitest";
import { FLOORS, PRESETS } from "@/lib/domain/permissions";
import { selectActivePermissions } from "@/lib/store/selectors";

const farms = [
  {
    id: 1,
    name: "Sítio Boa Vista",
    role: "owner" as const,
    preset: null,
    permissions: PRESETS.gerente,
    joinedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: 7,
    name: "Fazenda Maranata",
    role: "member" as const,
    preset: "vaqueiro" as const,
    permissions: PRESETS.vaqueiro,
    joinedAt: "2026-08-14T12:00:00.000Z",
  },
];

describe("selectActivePermissions", () => {
  it("reads the active farm's levels", () => {
    expect(selectActivePermissions(farms, 7)).toEqual(PRESETS.vaqueiro);
  });

  it("falls back to the floors when the active farm is unknown", () => {
    expect(selectActivePermissions(farms, 99)).toEqual(FLOORS);
    expect(selectActivePermissions([], null)).toEqual(FLOORS);
  });
});
