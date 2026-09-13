"use client";

/**
 * One member's permissions: a papel select that fills every area, the per-area
 * grid, and removal. Shared by the desktop dialog and the phone page.
 */
import { useState } from "react";
import { UserMinus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import type { TeamMember } from "@/lib/api/domains/team/useCases/BrowseTeam.useCase";
import {
  PRESETS,
  PRESET_IDS,
  PRESET_LABEL,
  canGrant,
  closestPreset,
  presetFor,
  type Permissions,
  type PresetId,
} from "@/lib/domain/permissions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PermissionsGrid } from "@/components/team/PermissionsGrid";
import { teamErrorMessage } from "@/components/team/helpers";
import { cn } from "@/lib/utils";

interface MemberPermissionsFormProps {
  member: TeamMember;
  /** The caller's own levels: nothing above them can be granted. */
  ceiling: Permissions;
  farmName: string;
  /** After a save or a removal went through. */
  onDone: () => void;
  onCancel: () => void;
  footerClassName?: string;
}

export function MemberPermissionsForm({
  member,
  ceiling,
  farmName,
  onDone,
  onCancel,
  footerClassName,
}: MemberPermissionsFormProps) {
  const [value, setValue] = useState<Permissions>(member.permissions);
  const [base, setBase] = useState<PresetId>(() =>
    member.preset !== null && member.preset !== "personalizado"
      ? member.preset
      : closestPreset(member.permissions)
  );
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);

  const current = presetFor(value);
  const presets = PRESET_IDS.filter((id) => id === current || canGrant(ceiling, PRESETS[id]).ok);

  function pickPreset(id: string) {
    if (id === "personalizado") return;
    const preset = id as PresetId;
    setBase(preset);
    setValue({ ...PRESETS[preset] });
  }

  async function save() {
    setBusy(true);
    const { error } = await api.farm.members({ userId: member.userId }).patch({ permissions: value });
    setBusy(false);
    if (error) {
      toast.error(teamErrorMessage(error));
      return;
    }
    toast.success(`Permissões de ${member.name} salvas`);
    onDone();
  }

  async function remove() {
    setBusy(true);
    const { error } = await api.farm.members({ userId: member.userId }).delete();
    setBusy(false);
    setRemoving(false);
    if (error) {
      toast.error(teamErrorMessage(error));
      return;
    }
    toast.success(`${member.name} saiu da equipe`);
    onDone();
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="member-preset">Papel</Label>
        <Select value={current} onValueChange={pickPreset}>
          <SelectTrigger id="member-preset" className="min-h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presets.map((id) => (
              <SelectItem key={id} value={id}>
                {PRESET_LABEL[id]}
              </SelectItem>
            ))}
            <SelectItem value="personalizado" disabled>
              Personalizado
            </SelectItem>
          </SelectContent>
        </Select>
        {current === "personalizado" ? (
          <p className="text-xs text-ink-soft">
            Parecido com {PRESET_LABEL[closestPreset(value)]}. Escolher um papel troca todas as
            áreas.
          </p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <span className="text-sm font-medium text-ink">Permissões por área</span>
        <PermissionsGrid value={value} onChange={setValue} ceiling={ceiling} base={PRESETS[base]} />
      </div>

      <div
        className={cn(
          "flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between",
          footerClassName
        )}
      >
        <Button
          type="button"
          variant="destructive"
          className="min-h-11"
          onClick={() => setRemoving(true)}
          disabled={busy}
        >
          <UserMinus aria-hidden />
          Remover da fazenda
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="min-h-11 flex-1 sm:flex-none" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" className="min-h-11 flex-1 sm:flex-none" onClick={save} disabled={busy}>
            Salvar
          </Button>
        </div>
      </div>

      <Dialog open={removing} onOpenChange={setRemoving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover {member.name}?</DialogTitle>
            <DialogDescription>
              {member.name} deixa de acessar a {farmName}. Para voltar, precisa de um novo convite.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setRemoving(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" className="min-h-11" onClick={remove} disabled={busy}>
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
