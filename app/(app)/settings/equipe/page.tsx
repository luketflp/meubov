import { RequireAccess } from "@/components/layout/RequireAccess";
import { TeamPage } from "@/components/team/TeamPage";

/** /settings/equipe: the farm's members, convites and permissions. */
export default function TeamSettingsPage() {
  return (
    <RequireAccess area="team" level="view">
      <TeamPage />
    </RequireAccess>
  );
}
