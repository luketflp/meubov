"use client";

/**
 * "Sua participação": for a member who is not the Dono, what they may do on
 * this farm and the way out of it.
 */
import { useState } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { clearActiveFarmId } from "@/lib/api/activeFarm";
import { formatInstantDate } from "@/lib/domain/invites";
import { roleLabel } from "@/lib/domain/permissions";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionCard } from "@/components/ui/section-card";
import { AccessSummaryBox } from "@/components/team/AccessSummaryBox";

export function MembershipCard() {
  const farms = useHerdStore((s) => s.farms);
  const activeFarmId = useHerdStore((s) => s.activeFarmId);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const farm = farms.find((option) => option.id === activeFarmId);
  if (!farm || farm.role === "owner") return null;
  const farmName = farm.name.trim() || `Fazenda #${farm.id}`;

  async function leave() {
    setBusy(true);
    const { error } = await api.farm.leave.post();
    if (error) {
      setBusy(false);
      toast.error("Não foi possível sair da fazenda.");
      return;
    }
    clearActiveFarmId();
    window.location.assign("/dashboard");
  }

  return (
    <SectionCard title="Sua participação">
      <div className="grid gap-3">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink">
          Você é <Badge variant="secondary">{roleLabel(farm.role, farm.preset)}</Badge> na {farmName}
          {farm.joinedAt ? ` desde ${formatInstantDate(farm.joinedAt)}` : ""}.
        </p>
        <AccessSummaryBox permissions={farm.permissions} />
        <p className="text-xs text-ink-soft">
          Só o dono ou quem cuida da equipe muda o que você pode fazer.
        </p>
        <div>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11"
            onClick={() => setConfirming(true)}
          >
            <LogOut aria-hidden />
            Sair da fazenda
          </Button>
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sair da {farmName}?</DialogTitle>
            <DialogDescription>
              Você deixa de ver o rebanho desta fazenda. Para voltar, alguém da equipe precisa
              convidar você de novo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" className="min-h-11" onClick={leave} disabled={busy}>
              Sair da fazenda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
