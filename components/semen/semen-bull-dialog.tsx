"use client";

/**
 * "Novo touro" and "Editar" of a semen bull. A bull is registered once — nome,
 * código, raça and central — and may bring its first purchase along, so semen
 * that already arrived enters the stock with the cadastro. Editing touches the
 * registration only: purchases have their own dialog and the doses used come
 * from the coberturas.
 *
 * Mirrors the other register dialogs: local validation, the store action, and
 * the name conflict the server answers shown under the fields.
 */
import { useState, type FormEvent } from "react";
import { Pencil, Plus } from "lucide-react";
import type { SemenBull } from "@/lib/types";
import {
  useHerdStore,
  type NewSemenPurchase,
  type SemenBullPatch,
} from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import {
  PurchaseInputs,
  createPurchaseFields,
  purchaseStarted,
  readPurchase,
  type PurchaseFields,
} from "@/components/semen/semen-purchase-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DUPLICATE_NAME = "Já existe um touro com esse nome.";

interface BullFields {
  name: string;
  code: string;
  breed: string;
  central: string;
  purchase: PurchaseFields;
}

/** The bull's registration as stored, or blank for a new one. */
function createInitialFields(bull: SemenBull | undefined): BullFields {
  return {
    name: bull?.name ?? "",
    code: bull?.code ?? "",
    breed: bull?.breed ?? "",
    central: bull?.central ?? "",
    purchase: createPurchaseFields(),
  };
}

/** The registration fields that differ from the stored bull; a cleared text is sent blank. */
function changedFields(bull: SemenBull, fields: BullFields): SemenBullPatch {
  const patch: SemenBullPatch = {};
  const name = fields.name.trim();
  const code = fields.code.trim();
  const central = fields.central.trim();
  if (name !== bull.name) patch.name = name;
  if (code !== (bull.code ?? "")) patch.code = code;
  if (fields.breed !== (bull.breed ?? "")) patch.breed = fields.breed;
  if (central !== (bull.central ?? "")) patch.central = central;
  return patch;
}

const orNothing = (text: string): string | undefined => (text === "" ? undefined : text);

interface SemenBullDialogProps {
  /** The bull to edit; without one the dialog registers a new bull. */
  bull?: SemenBull;
}

export function SemenBullDialog({ bull }: SemenBullDialogProps) {
  const breeds = useHerdStore((s) => s.breeds);
  const addSemenBull = useHerdStore((s) => s.addSemenBull);
  const updateSemenBull = useHerdStore((s) => s.updateSemenBull);
  const { addToast } = useToast();

  const editing = bull !== undefined;
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<BullFields>(() => createInitialFields(bull));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The raça is free text on the bull: one that left the farm's list still shows.
  const breedOptions =
    fields.breed !== "" && !breeds.includes(fields.breed) ? [fields.breed, ...breeds] : breeds;

  function onOpenChange(next: boolean) {
    // Reopening shows what is stored now, never the last abandoned attempt.
    if (next) {
      setFields(createInitialFields(bull));
      setError(null);
    }
    setOpen(next);
  }

  /** Registers the new bull; the first purchase goes along when one was typed. */
  async function register() {
    let firstPurchase: NewSemenPurchase | undefined;
    if (purchaseStarted(fields.purchase)) {
      const reading = readPurchase(fields.purchase);
      if (reading.error !== null) {
        setError(reading.error);
        return;
      }
      firstPurchase = reading.purchase;
    }
    const result = await addSemenBull({
      name: fields.name.trim(),
      code: orNothing(fields.code.trim()),
      breed: orNothing(fields.breed),
      central: orNothing(fields.central.trim()),
      firstPurchase,
    });
    if (result === "duplicate") {
      setError(DUPLICATE_NAME);
      return;
    }
    addToast({ messageType: "success", text: "Touro cadastrado" });
    setOpen(false);
  }

  /** Saves what changed in the registration of `stored`. */
  async function save(stored: SemenBull) {
    const patch = changedFields(stored, fields);
    // Nothing changed: the server would only send the bull back as it is, so just close.
    if (Object.keys(patch).length === 0) {
      setOpen(false);
      return;
    }
    if (!(await updateSemenBull(stored.id, patch))) {
      setError(DUPLICATE_NAME);
      return;
    }
    setOpen(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (fields.name.trim() === "") {
      setError("Informe o nome do touro.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await (bull ? save(bull) : register());
    } catch {
      // The store already told the farmer; the dialog stays open to try again.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="outline" className="min-h-11">
            <Pencil data-icon="inline-start" aria-hidden />
            Editar
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="min-h-11 md:min-h-0">
            <Plus data-icon="inline-start" aria-hidden />
            Novo touro
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar touro" : "Novo touro"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Corrija o cadastro do touro. As compras e as doses usadas não mudam."
              : "Cadastre o sêmen uma vez. Cada compra soma doses ao estoque e cada inseminação IATF usa uma."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="semen-bull-name">Nome</Label>
              <Input
                id="semen-bull-name"
                value={fields.name}
                onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Tufão da Serra"
                className="min-h-11"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="semen-bull-code">Código ou registro</Label>
              <Input
                id="semen-bull-code"
                value={fields.code}
                onChange={(e) => setFields((f) => ({ ...f, code: e.target.value }))}
                placeholder="Ex.: NEL-4471"
                className="min-h-11 font-mono"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="semen-bull-breed">Raça</Label>
              <Select
                value={fields.breed === "" ? undefined : fields.breed}
                onValueChange={(breed) => setFields((f) => ({ ...f, breed }))}
              >
                <SelectTrigger id="semen-bull-breed" className="min-h-11 w-full">
                  <SelectValue placeholder="Selecione a raça" />
                </SelectTrigger>
                <SelectContent>
                  {breedOptions.map((breed) => (
                    <SelectItem key={breed} value={breed}>
                      {breed}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="semen-bull-central">Central</Label>
              <Input
                id="semen-bull-central"
                value={fields.central}
                onChange={(e) => setFields((f) => ({ ...f, central: e.target.value }))}
                placeholder="Ex.: Genética Boa Vista"
                className="min-h-11"
              />
            </div>
          </div>

          {editing ? null : (
            <div
              role="group"
              aria-labelledby="semen-bull-first-purchase"
              className="grid gap-3 border-t border-hairline pt-4"
            >
              <div>
                <p id="semen-bull-first-purchase" className="text-sm font-medium text-ink">
                  Primeira compra (opcional)
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Se o sêmen já chegou, as doses entram no estoque junto com o cadastro.
                </p>
              </div>
              <PurchaseInputs
                idPrefix="semen-bull-purchase"
                fields={fields.purchase}
                onChange={(patch) =>
                  setFields((f) => ({ ...f, purchase: { ...f.purchase, ...patch } }))
                }
                totalHint="Vira despesa de Reprodução no Financeiro"
              />
            </div>
          )}

          {error ? <p className="text-xs text-overdue">{error}</p> : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving} className="min-h-11">
              {editing ? "Salvar" : "Cadastrar touro"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
