import { ShieldAlert } from "lucide-react";

/** Discreet banner of the mandatory foot-and-mouth disease campaign. */
export function FootAndMouthBanner() {
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-lg bg-fmd-soft px-4 py-2.5 text-sm text-fmd"
    >
      <ShieldAlert className="size-4 shrink-0" aria-hidden />
      <p>
        <span className="font-medium">Campanha de vacinação contra febre aftosa</span> —
        obrigatória
      </p>
    </div>
  );
}
