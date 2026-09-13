import { Lock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

/** What a page shows when opened by URL without access to its area. */
export function NoAccess() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-8">
      <div className="rounded-lg border border-hairline bg-panel">
        <EmptyState
          icon={Lock}
          title="Sem acesso a esta área"
          description="Quem cuida da equipe da fazenda decide o que cada pessoa pode ver."
        />
      </div>
    </div>
  );
}
