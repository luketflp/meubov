/** Words for the Equipe screens: why a member is out of reach, how far a grant goes, what failed. */
import { AREA_LABEL, type Area, type Level, type ManageBlock } from "@/lib/domain/permissions";

/** The line a member row shows instead of "Permissões"; nothing on the Dono's row. */
export function manageBlockLabel(reason: ManageBlock): string | null {
  if (reason === "self") return "É você";
  if (reason === "above") return "Tem mais acesso que você";
  return null;
}

/** The note under an area the actor cannot fully grant, given the actor's own level. */
export function ceilingNote(area: Area, actorLevel: Level): string | null {
  if (actorLevel === "edit") return null;
  const name = AREA_LABEL[area];
  return actorLevel === "view"
    ? `Você tem só Ver em ${name}, então pode dar até Ver.`
    : `Você não tem acesso a ${name}, então não pode dar acesso.`;
}

/** A team route's refusal, for a field error or a toast. */
export function teamErrorMessage(error: { status: number; value?: unknown }): string {
  const body =
    typeof error.value === "object" && error.value !== null
      ? (error.value as { error?: string; area?: Area | null; reason?: ManageBlock })
      : {};
  if (body.error === "invalid_email") return "Informe um e-mail válido.";
  if (body.error === "already_member") return "Esta pessoa já é membro da fazenda.";
  if (body.error === "forbidden" && body.area) {
    return `Você não pode dar esse acesso em ${AREA_LABEL[body.area]}.`;
  }
  if (body.error === "blocked" && body.reason === "above") {
    return "Esta pessoa tem mais acesso que você.";
  }
  if (body.error === "blocked") return "Você não pode alterar esta pessoa.";
  return "Não foi possível salvar. Tente novamente.";
}
