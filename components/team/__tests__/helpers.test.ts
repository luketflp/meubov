import { describe, expect, it } from "vitest";
import { ceilingNote, manageBlockLabel, teamErrorMessage } from "@/components/team/helpers";

describe("manageBlockLabel", () => {
  it("explains why a row has no Permissões button", () => {
    expect(manageBlockLabel("self")).toBe("É você");
    expect(manageBlockLabel("above")).toBe("Tem mais acesso que você");
    expect(manageBlockLabel("owner")).toBeNull();
  });
});

describe("ceilingNote", () => {
  it("says how far the actor can grant an area", () => {
    expect(ceilingNote("finance", "edit")).toBeNull();
    expect(ceilingNote("finance", "view")).toBe(
      "Você tem só Ver em Financeiro, então pode dar até Ver."
    );
    expect(ceilingNote("finance", "none")).toBe(
      "Você não tem acesso a Financeiro, então não pode dar acesso."
    );
  });
});

describe("teamErrorMessage", () => {
  it("puts each refusal in words", () => {
    expect(teamErrorMessage({ status: 422, value: { error: "invalid_email" } })).toBe(
      "Informe um e-mail válido."
    );
    expect(teamErrorMessage({ status: 409, value: { error: "already_member" } })).toBe(
      "Esta pessoa já é membro da fazenda."
    );
    expect(teamErrorMessage({ status: 403, value: { error: "forbidden", area: "finance" } })).toBe(
      "Você não pode dar esse acesso em Financeiro."
    );
    expect(teamErrorMessage({ status: 403, value: { error: "blocked", reason: "above" } })).toBe(
      "Esta pessoa tem mais acesso que você."
    );
    expect(teamErrorMessage({ status: 500, value: "boom" })).toBe(
      "Não foi possível salvar. Tente novamente."
    );
  });
});
