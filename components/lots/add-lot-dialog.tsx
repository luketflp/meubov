"use client";

/**
 * Registers a logical cattle group and places it in its first invernada.
 */
import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
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

export function AddLotDialog() {
  const addLot = useHerdStore((s) => s.addLot);
  const invernadas = useHerdStore((s) => s.invernadas);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [invernadaId, setInvernadaId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function onOpenChange(next: boolean) {
    if (next) {
      setName("");
      setInvernadaId(invernadas[0]?.id ?? "");
      setError(null);
    }
    setOpen(next);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (cleanName === "") {
      setError("Informe o nome do lote.");
      return;
    }
    if (invernadaId === "") {
      setError("Selecione a invernada inicial.");
      return;
    }
    setSaving(true);
    try {
      await addLot({ name: cleanName, invernadaId });
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === "duplicate_lot_name"
          ? "Já existe um lote com esse nome."
          : "Não foi possível cadastrar. Tente novamente."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-11">
          <Plus aria-hidden />
          Novo lote
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo lote</DialogTitle>
          <DialogDescription>
            O lote é o grupo de animais. Escolha a invernada onde ele está agora.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="lot-name">Nome</Label>
            <Input
              id="lot-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Novilhas 2025"
              className="min-h-11"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lot-invernada">Invernada inicial</Label>
            <Select value={invernadaId || undefined} onValueChange={setInvernadaId}>
              <SelectTrigger id="lot-invernada" className="min-h-11 w-full">
                <SelectValue placeholder="Selecione a invernada" />
              </SelectTrigger>
              <SelectContent>
                {invernadas.map((invernada) => (
                  <SelectItem key={invernada.id} value={invernada.id}>
                    {invernada.code}{invernada.name ? ` · ${invernada.name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {invernadas.length === 0 ? (
              <p className="text-xs text-attention">
                Cadastre uma invernada nas Configurações antes de criar o lote.
              </p>
            ) : null}
          </div>
          {error ? <p className="text-xs text-overdue">{error}</p> : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving || invernadas.length === 0} className="min-h-11">
              {saving ? "Cadastrando…" : "Cadastrar lote"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
