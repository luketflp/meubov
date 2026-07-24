"use client";

/**
 * "Register movement" dialog: trigger button + form for purchase,
 * sale or transfer, with optional selection of animals from the origin lot.
 * Validation is a local pure function (validateMovement).
 */
import { useState, type FormEvent } from "react";
import { Plus, Search } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { activeAnimals } from "@/lib/store/selectors";
import type { Animal, MovementType } from "@/lib/types";
import { TODAY_ISO } from "@/lib/domain/dates";
import { kgToArroba, currentWeight } from "@/lib/domain/weights";
import { formatArroba, formatKg } from "@/lib/domain/format";
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
import { Textarea } from "@/components/ui/textarea";
import { TYPE_LABELS } from "@/components/movements/movement-type-pill";

/** Origin/destination outside the farm. */
const EXTERNAL = "Externo";

/** Raw form state (quantity as input text). */
export interface MovementFields {
  type: MovementType;
  date: string;
  quantity: string;
  origin: string;
  destination: string;
  notes: string;
  earTags: string[];
}

export type MovementErrors = Partial<
  Record<"date" | "quantity" | "origin" | "destination", string>
>;

/** Pure form validation; returns pt-BR messages per field. */
export function validateMovement(fields: MovementFields): MovementErrors {
  const errors: MovementErrors = {};
  if (fields.date === "") {
    errors.date = "Informe a data da movimentação.";
  }
  if (fields.earTags.length === 0) {
    const quantity = Number(fields.quantity);
    if (fields.quantity.trim() === "" || !Number.isInteger(quantity) || quantity < 1) {
      errors.quantity = "Informe uma quantidade inteira de pelo menos 1.";
    }
  }
  if (fields.type !== "purchase" && fields.origin === "") {
    errors.origin = "Selecione o lote de origem.";
  }
  if (fields.type !== "sale" && fields.destination === "") {
    errors.destination = "Selecione o lote de destino.";
  }
  if (fields.type === "transfer" && fields.origin !== "" && fields.origin === fields.destination) {
    errors.destination = "O lote de destino deve ser diferente do lote de origem.";
  }
  return errors;
}

function createInitialFields(): MovementFields {
  return {
    type: "purchase",
    date: TODAY_ISO,
    quantity: "1",
    origin: EXTERNAL,
    destination: "",
    notes: "",
    earTags: [],
  };
}

function ErrorMessage({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-overdue">{message}</p>;
}

function AnimalRow({
  animal,
  checked,
  onToggle,
}: {
  animal: Animal;
  checked: boolean;
  onToggle: () => void;
}) {
  const weight = currentWeight(animal);
  return (
    <li className="border-b border-hairline last:border-b-0">
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm transition-colors hover:bg-brand-soft/50">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="size-4 shrink-0 accent-brand"
        />
        <span className="font-mono font-medium text-ink">{animal.earTag}</span>
        <span className="ml-auto font-mono text-xs text-ink-soft">
          {weight === null
            ? "Sem pesagem"
            : `${formatKg(weight)} · ${formatArroba(kgToArroba(weight))}`}
        </span>
      </label>
    </li>
  );
}

export function RegisterMovementDialog() {
  const lots = useHerdStore((s) => s.lots);
  const animals = useHerdStore((s) => s.animals);
  const recordMovement = useHerdStore((s) => s.recordMovement);

  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<MovementFields>(createInitialFields);
  const [errors, setErrors] = useState<MovementErrors>({});
  const [search, setSearch] = useState("");

  function onOpenChange(next: boolean) {
    if (next) {
      setFields(createInitialFields());
      setErrors({});
      setSearch("");
    }
    setOpen(next);
  }

  const selectionLocksQuantity = fields.earTags.length > 0;
  const originLot = lots.find((l) => l.name === fields.origin);
  const selectableAnimals =
    fields.type !== "purchase" && originLot
      ? activeAnimals(animals).filter((a) => a.lotId === originLot.id)
      : [];
  const searchTerm = search.trim().toLowerCase();
  const filteredAnimals =
    searchTerm === ""
      ? selectableAnimals
      : selectableAnimals.filter((a) => a.earTag.toLowerCase().includes(searchTerm));

  function onChangeType(type: MovementType) {
    setSearch("");
    setFields((f) => ({
      ...f,
      type,
      origin: type === "purchase" ? EXTERNAL : f.origin === EXTERNAL ? "" : f.origin,
      destination: type === "sale" ? EXTERNAL : f.destination === EXTERNAL ? "" : f.destination,
      earTags: [],
    }));
  }

  function onChangeOrigin(origin: string) {
    setSearch("");
    setFields((f) => ({ ...f, origin, earTags: [] }));
  }

  function toggleEarTag(earTag: string) {
    setFields((f) => ({
      ...f,
      earTags: f.earTags.includes(earTag)
        ? f.earTags.filter((t) => t !== earTag)
        : [...f.earTags, earTag],
    }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newErrors = validateMovement(fields);
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;
    const notes = fields.notes.trim();
    recordMovement({
      type: fields.type,
      date: fields.date,
      quantity: selectionLocksQuantity
        ? fields.earTags.length
        : Number(fields.quantity),
      origin: fields.origin,
      destination: fields.destination,
      notes: notes === "" ? undefined : notes,
      earTags: selectionLocksQuantity ? fields.earTags : undefined,
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="min-h-11">
          <Plus aria-hidden />
          Registrar movimentação
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar movimentação</DialogTitle>
          <DialogDescription>
            Compra, venda ou transferência de animais entre os pastos da fazenda.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="mov-type">Tipo</Label>
              <Select value={fields.type} onValueChange={onChangeType}>
                <SelectTrigger id="mov-type" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as MovementType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="mov-date">Data</Label>
              <Input
                id="mov-date"
                type="date"
                value={fields.date}
                onChange={(e) => setFields((f) => ({ ...f, date: e.target.value }))}
                aria-invalid={errors.date ? true : undefined}
                className="min-h-11 font-mono"
              />
              <ErrorMessage message={errors.date} />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="mov-quantity">Quantidade</Label>
              <Input
                id="mov-quantity"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={
                  selectionLocksQuantity
                    ? String(fields.earTags.length)
                    : fields.quantity
                }
                onChange={(e) => setFields((f) => ({ ...f, quantity: e.target.value }))}
                disabled={selectionLocksQuantity}
                aria-invalid={errors.quantity ? true : undefined}
                className="min-h-11 font-mono"
              />
              {selectionLocksQuantity ? (
                <p className="text-xs text-ink-soft">
                  Quantidade travada pela seleção de animais.
                </p>
              ) : null}
              <ErrorMessage message={errors.quantity} />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="mov-origin">Origem</Label>
              <Select
                value={fields.origin === "" ? undefined : fields.origin}
                onValueChange={onChangeOrigin}
                disabled={fields.type === "purchase"}
              >
                <SelectTrigger
                  id="mov-origin"
                  className="min-h-11 w-full"
                  aria-invalid={errors.origin ? true : undefined}
                >
                  <SelectValue placeholder="Selecione o lote" />
                </SelectTrigger>
                <SelectContent>
                  {fields.type === "purchase" ? (
                    <SelectItem value={EXTERNAL}>{EXTERNAL}</SelectItem>
                  ) : (
                    lots.map((lot) => (
                      <SelectItem key={lot.id} value={lot.name}>
                        {lot.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <ErrorMessage message={errors.origin} />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="mov-destination">Destino</Label>
              <Select
                value={fields.destination === "" ? undefined : fields.destination}
                onValueChange={(destination) => setFields((f) => ({ ...f, destination }))}
                disabled={fields.type === "sale"}
              >
                <SelectTrigger
                  id="mov-destination"
                  className="min-h-11 w-full"
                  aria-invalid={errors.destination ? true : undefined}
                >
                  <SelectValue placeholder="Selecione o lote" />
                </SelectTrigger>
                <SelectContent>
                  {fields.type === "sale" ? (
                    <SelectItem value={EXTERNAL}>{EXTERNAL}</SelectItem>
                  ) : (
                    lots.map((lot) => (
                      <SelectItem key={lot.id} value={lot.name}>
                        {lot.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <ErrorMessage message={errors.destination} />
            </div>
          </div>

          {fields.type !== "purchase" ? (
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium text-ink">
                Selecionar animais (opcional)
              </legend>
              {fields.origin === "" ? (
                <p className="text-xs text-ink-soft">
                  Escolha o lote de origem para listar os animais.
                </p>
              ) : selectableAnimals.length === 0 ? (
                <p className="text-xs text-ink-soft">
                  Nenhum animal ativo no lote {fields.origin}.
                </p>
              ) : (
                <>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
                      aria-hidden
                    />
                    <Input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar brinco"
                      aria-label="Buscar animal por brinco"
                      className="min-h-11 pl-9 font-mono md:min-h-9"
                    />
                  </div>
                  <ul className="max-h-44 overflow-y-auto rounded-lg border border-hairline">
                    {filteredAnimals.length === 0 ? (
                      <li className="px-3 py-3 text-xs text-ink-soft">
                        Nenhum animal com brinco “{search.trim()}”.
                      </li>
                    ) : (
                      filteredAnimals.map((animal) => (
                        <AnimalRow
                          key={animal.earTag}
                          animal={animal}
                          checked={fields.earTags.includes(animal.earTag)}
                          onToggle={() => toggleEarTag(animal.earTag)}
                        />
                      ))
                    )}
                  </ul>
                  {fields.earTags.length > 0 ? (
                    <p className="text-xs text-ink-soft">
                      {fields.earTags.length}{" "}
                      {fields.earTags.length === 1 ? "animal selecionado" : "animais selecionados"}{" "}
                      — a quantidade acompanha a seleção.
                    </p>
                  ) : null}
                </>
              )}
            </fieldset>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="mov-notes">Observação (opcional)</Label>
            <Textarea
              id="mov-notes"
              value={fields.notes}
              onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Ex.: venda para frigorífico, ajuste de lotação…"
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" className="min-h-11">
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
