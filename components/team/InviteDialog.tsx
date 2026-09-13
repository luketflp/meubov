"use client";

/**
 * "Convidar membro": an e-mail and what the person may do. Nothing is sent; the
 * convite waits for whoever signs in with the e-mail.
 */
import { useState, type FormEvent } from "react";
import { ChevronDown, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { isValidEmail, normalizeEmail } from "@/lib/domain/invites";
import {
  FLOORS,
  PRESETS,
  PRESET_IDS,
  PRESET_LABEL,
  canGrant,
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccessSummaryBox } from "@/components/team/AccessSummaryBox";
import { PermissionsGrid } from "@/components/team/PermissionsGrid";
import { teamErrorMessage } from "@/components/team/helpers";
import { cn } from "@/lib/utils";

const PRESET_HINT: Record<PresetId, string> = {
  gerente: "Edita tudo, inclusive valores e equipe.",
  vaqueiro: "Trabalha o rebanho no dia a dia. Não vê valores em R$.",
  consultor: "Vê tudo e não altera nada. Para veterinário ou consultor.",
};

interface Levels {
  base: PresetId | null;
  value: Permissions;
}

/** Vaqueiro when the actor may grant it, else the first preset they may, else the floors. */
function startingLevels(presets: PresetId[]): Levels {
  const first = presets.includes("vaqueiro") ? "vaqueiro" : presets[0];
  return first ? { base: first, value: { ...PRESETS[first] } } : { base: null, value: { ...FLOORS } };
}

export function InviteDialog({
  ceiling,
  onCreated,
}: {
  ceiling: Permissions;
  onCreated: () => void;
}) {
  const presets = PRESET_IDS.filter((id) => canGrant(ceiling, PRESETS[id]).ok);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [levels, setLevels] = useState<Levels>(() => startingLevels(presets));
  const [adjusting, setAdjusting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function onOpenChange(next: boolean) {
    if (next) {
      setEmail("");
      setLevels(startingLevels(presets));
      setAdjusting(false);
      setError(null);
    }
    setOpen(next);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = normalizeEmail(email);
    if (!isValidEmail(clean)) {
      setError("Informe um e-mail válido.");
      return;
    }
    setBusy(true);
    const { error: apiError } = await api.farm.invites.post({
      email: clean,
      permissions: levels.value,
    });
    setBusy(false);
    if (apiError) {
      const code = (apiError.value as { error?: string } | null)?.error;
      if (code === "invalid_email" || code === "already_member") {
        setError(teamErrorMessage(apiError));
      } else {
        toast.error(teamErrorMessage(apiError));
      }
      return;
    }
    toast.success(`Convite criado para ${clean}`);
    setOpen(false);
    onCreated();
  }

  const current = presetFor(levels.value);
  const who = current === "personalizado" ? "esta pessoa" : `o ${PRESET_LABEL[current]}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="min-h-11 w-full sm:w-auto">
          <UserPlus aria-hidden />
          Convidar membro
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Convidar membro</DialogTitle>
          <DialogDescription>
            Quando a pessoa entrar no MeuBov com este e-mail, verá o convite para aceitar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="invite-email">E-mail</Label>
            <Input
              id="invite-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              className="min-h-11"
            />
            {error ? <p className="text-xs text-overdue">{error}</p> : null}
          </div>

          {presets.length > 0 ? (
            <div className="grid gap-1.5">
              <span className="text-sm font-medium text-ink">Papel</span>
              <div role="radiogroup" aria-label="Papel" className="grid gap-2 sm:grid-cols-3">
                {presets.map((id) => {
                  const selected = current === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setLevels({ base: id, value: { ...PRESETS[id] } })}
                      className={cn(
                        "flex min-h-11 flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
                        selected ? "border-brand/45 bg-surface" : "border-hairline bg-panel hover:bg-surface"
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-ink">
                        <span
                          aria-hidden
                          className={cn(
                            "flex size-4 items-center justify-center rounded-full border",
                            selected ? "border-brand" : "border-hairline"
                          )}
                        >
                          {selected ? <span className="size-2 rounded-full bg-brand" /> : null}
                        </span>
                        {PRESET_LABEL[id]}
                      </span>
                      <span className="text-xs text-pretty text-ink-soft">{PRESET_HINT[id]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="grid gap-2 rounded-lg border border-hairline bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium tracking-wide text-ink-soft uppercase">
                O que {who} pode fazer
              </span>
              <button
                type="button"
                aria-expanded={adjusting}
                onClick={() => setAdjusting((value) => !value)}
                className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand md:min-h-0"
              >
                Ajustar por área
                <ChevronDown
                  className={cn("size-3.5 transition-transform", adjusting && "rotate-180")}
                  aria-hidden
                />
              </button>
            </div>
            {adjusting ? (
              <PermissionsGrid
                value={levels.value}
                onChange={(value) => setLevels((prev) => ({ ...prev, value }))}
                ceiling={ceiling}
                base={levels.base ? PRESETS[levels.base] : null}
              />
            ) : (
              <AccessSummaryBox permissions={levels.value} bare />
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="min-h-11" disabled={busy}>
              Criar convite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
