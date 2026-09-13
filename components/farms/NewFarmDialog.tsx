"use client";

/**
 * "Nova fazenda": nome and município, and — when the open farm has any — the
 * switch that starts the new farm from its raças, categorias and protocolos.
 * The form mounts with each opening, so every time it starts empty.
 */
import { useState, type FormEvent } from "react";
import { FARM_FIELD_MAX, validateNewFarm } from "@/lib/domain/farms";
import type { NewFarmInput } from "@/lib/store/useHerdStore";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const NEW_FARM_DESCRIPTION =
  "Você será o dono. A equipe desta fazenda não vai junto: convide quem precisar depois, em Configurações > Equipe.";

export const FIRST_FARM_DESCRIPTION =
  "Você será o dono. Depois é só convidar a equipe em Configurações > Equipe.";

/** The open farm's setup, offered to the new farm. */
export interface CopySource {
  /** farmLabel of the open farm. */
  label: string;
  /** copySummary of what it holds. */
  summary: string;
  /** On for the Dono of the open farm. */
  defaultOn: boolean;
}

export interface NewFarmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null where there is nothing to copy from (/convites, an empty open farm). */
  source: CopySource | null;
  description: string;
  /** Saves the farm; a rejection keeps the dialog open with the fields as typed. */
  onSubmit: (input: NewFarmInput) => Promise<void>;
}

export function NewFarmDialog({ open, onOpenChange, source, description, onSubmit }: NewFarmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <NewFarmForm
          source={source}
          description={description}
          onSubmit={onSubmit}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface NewFarmFormProps extends Pick<NewFarmDialogProps, "source" | "description" | "onSubmit"> {
  onClose: () => void;
}

function NewFarmForm({ source, description, onSubmit, onClose }: NewFarmFormProps) {
  const [name, setName] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [copy, setCopy] = useState(source?.defaultOn ?? false);
  const [busy, setBusy] = useState(false);
  const ready = validateNewFarm({ name, municipality }).ok;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      await onSubmit({ name, municipality, copy: source !== null && copy });
      onClose();
    } catch {
      // The store already said why in a toast; the fields stay as typed.
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Nova fazenda</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} noValidate className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="new-farm-name">Nome</Label>
          <Input
            id="new-farm-name"
            autoFocus
            autoComplete="off"
            maxLength={FARM_FIELD_MAX}
            placeholder="Ex.: Fazenda Boa Vista"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-h-11"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="new-farm-municipality">Município</Label>
          <Input
            id="new-farm-municipality"
            autoComplete="off"
            maxLength={FARM_FIELD_MAX}
            placeholder="Ex.: Sorriso - MT"
            value={municipality}
            onChange={(e) => setMunicipality(e.target.value)}
            className="min-h-11"
          />
        </div>

        {source ? (
          <label
            htmlFor="new-farm-copy"
            className="flex items-start gap-3 rounded-lg border border-hairline bg-surface p-3"
          >
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="text-sm font-medium text-ink">Usar o cadastro da {source.label}</span>
              <span className="text-xs text-pretty text-ink-soft">
                {source.summary} Animais, lotes, invernadas, touros e equipe não vêm junto.
              </span>
            </span>
            <Switch id="new-farm-copy" checked={copy} onCheckedChange={setCopy} className="mt-0.5" />
          </label>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" className="min-h-11" disabled={!ready || busy}>
            Criar fazenda
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
