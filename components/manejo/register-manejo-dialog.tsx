"use client";

/**
 * "Iniciar manejo" dialog: opens a manejo session (curral working session) for
 * the selected animals. A sanitary action (vaccine, deworming, medication,
 * exam) captures product, dose, withdrawal, responsible, cost and optional
 * booster date; weighing is a toggle (or the session itself). Nothing is
 * applied here: the animals are handled one by one on the session screen, as
 * they pass the chute. Validation is a local pure function (validateManejo).
 */
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Play, Search } from "lucide-react";
import { useHerdStore, type NewManejoSession } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { activeAnimals } from "@/lib/store/selectors";
import type { Animal, Category, TreatmentType } from "@/lib/types";
import { todayISO, formatAge } from "@/lib/domain/dates";
import { CATEGORY_LABEL } from "@/lib/domain/labels";
import { currentWeight } from "@/lib/domain/weights";
import { formatKg } from "@/lib/domain/format";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  actionKind,
  isMovementAction,
  isSanitaryAction,
  MANEJO_ACTION_LABEL,
  MANEJO_ACTION_LIST,
  sessionWeighs,
  validateManejo,
  type ManejoAction,
  type ManejoErrors,
  type ManejoFields,
  type SalePricing,
} from "@/components/manejo/helpers";

/** Sentinel of the "all" option in the lot/category filters. */
const ALL = "all";

const CATEGORY_LIST = Object.keys(CATEGORY_LABEL) as Category[];

/** Number typed in a form field, or undefined when it is empty/invalid. */
function typedNumber(raw: string): number | undefined {
  const value = Number(raw.replace(",", "."));
  return raw.trim() === "" || !Number.isFinite(value) || value <= 0 ? undefined : value;
}

function createInitialFields(): ManejoFields {
  return {
    action: "vaccine",
    date: todayISO(),
    name: "",
    dose: "",
    withdrawalDays: "0",
    responsible: "",
    costBrl: "",
    nextDate: "",
    notes: "",
    weighAlso: false,
    earTags: [],
    destinationLotId: "",
    counterparty: "",
    pricing: "perArroba",
    pricePerArroba: "",
    totalAmountBrl: "",
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
  const lastWeight = currentWeight(animal);
  return (
    <li className="border-b border-hairline last:border-b-0">
      <div className="flex min-h-11 items-center gap-2.5 px-3 py-1.5 text-sm transition-colors hover:bg-brand-soft/50">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="size-4 shrink-0 accent-brand"
          />
          <span className="font-mono font-medium text-ink">{animal.earTag}</span>
          <span className="truncate text-xs text-ink-soft">
            {CATEGORY_LABEL[animal.category]} · {formatAge(animal.birthDate)}
          </span>
        </label>
        <span className="ml-auto shrink-0 font-mono text-xs text-ink-soft">
          {lastWeight === null ? "Sem pesagem" : formatKg(lastWeight)}
        </span>
      </div>
    </li>
  );
}

export function RegisterManejoDialog() {
  const router = useRouter();
  const lots = useHerdStore((s) => s.lots);
  const animals = useHerdStore((s) => s.animals);
  const startManejoSession = useHerdStore((s) => s.startManejoSession);
  const { addToast } = useToast();

  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<ManejoFields>(createInitialFields);
  const [errors, setErrors] = useState<ManejoErrors>({});
  const [lotId, setLotId] = useState<string>(ALL);
  const [category, setCategory] = useState<Category | typeof ALL>(ALL);
  const [search, setSearch] = useState("");

  const sanitary = isSanitaryAction(fields.action);
  const moves = isMovementAction(fields.action);
  // An entrada registers its animals at the chute, so there is nothing to pick.
  const picksAnimals = fields.action !== "entry";

  function onOpenChange(next: boolean) {
    if (next) {
      setFields(createInitialFields());
      setErrors({});
      setLotId(ALL);
      setCategory(ALL);
      setSearch("");
    }
    setOpen(next);
  }

  const selectable = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    return activeAnimals(animals).filter(
      (a) =>
        (lotId === ALL || a.lotId === lotId) &&
        (category === ALL || a.category === category) &&
        (searchTerm === "" || a.earTag.toLowerCase().includes(searchTerm))
    );
  }, [animals, lotId, category, search]);

  const allVisibleSelected =
    selectable.length > 0 && selectable.every((a) => fields.earTags.includes(a.earTag));

  function toggleEarTag(earTag: string) {
    setFields((f) => ({
      ...f,
      earTags: f.earTags.includes(earTag)
        ? f.earTags.filter((t) => t !== earTag)
        : [...f.earTags, earTag],
    }));
  }

  function toggleAllVisible() {
    setFields((f) => {
      if (allVisibleSelected) {
        const visible = new Set(selectable.map((a) => a.earTag));
        return { ...f, earTags: f.earTags.filter((t) => !visible.has(t)) };
      }
      const merged = new Set([...f.earTags, ...selectable.map((a) => a.earTag)]);
      return { ...f, earTags: [...merged] };
    });
  }

  function onChangeAction(action: ManejoAction) {
    setErrors({});
    setFields((f) => ({ ...f, action, weighAlso: false, earTags: [] }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newErrors = validateManejo(fields);
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const input: NewManejoSession = {
      date: fields.date,
      kind: actionKind(fields.action),
      earTags: fields.earTags,
      weighing: sessionWeighs(fields),
    };
    if (moves) {
      const counterparty = fields.counterparty.trim();
      if (fields.action === "transfer" || fields.action === "entry") {
        input.destinationLotId = fields.destinationLotId;
      }
      if (counterparty !== "") input.counterparty = counterparty;
      if (fields.action === "sale" && fields.pricing === "perArroba") {
        input.pricePerArroba = typedNumber(fields.pricePerArroba);
      } else if (fields.action === "sale" || fields.action === "entry") {
        input.totalAmountBrl = typedNumber(fields.totalAmountBrl);
      }
    }
    if (sanitary) {
      const dose = fields.dose.trim();
      const responsible = fields.responsible.trim();
      const notes = fields.notes.trim();
      const cost = fields.costBrl.trim();
      input.treatment = {
        // `sanitary` already narrowed the action down to the treatment types.
        type: fields.action as TreatmentType,
        name: fields.name.trim(),
        withdrawalDays: Number(fields.withdrawalDays),
        dose: dose === "" ? undefined : dose,
        responsible: responsible === "" ? undefined : responsible,
        costBrl: cost === "" ? undefined : Number(cost),
        notes: notes === "" ? undefined : notes,
        nextDate: fields.nextDate === "" ? undefined : fields.nextDate,
      };
    }
    const id = await startManejoSession(input);
    addToast({ messageType: "success", text: "Manejo iniciado" });
    setOpen(false);
    router.push(`/manejo/${id}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="min-h-11">
          <Play aria-hidden />
          Iniciar manejo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Iniciar manejo</DialogTitle>
          <DialogDescription>
            {fields.action === "entry"
              ? "Os animais comprados entram no rebanho um a um, conforme passam no brete e recebem o brinco."
              : "Monte a lista do curral e comece o trabalho: os animais são manejados um a um no brete, e o andamento fica salvo na sessão."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="manejo-action">Tipo de manejo</Label>
              <Select value={fields.action} onValueChange={onChangeAction}>
                <SelectTrigger id="manejo-action" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANEJO_ACTION_LIST.map((action) => (
                    <SelectItem key={action} value={action}>
                      {MANEJO_ACTION_LABEL[action]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="manejo-date">Data</Label>
              <Input
                id="manejo-date"
                type="date"
                value={fields.date}
                onChange={(e) => setFields((f) => ({ ...f, date: e.target.value }))}
                aria-invalid={errors.date ? true : undefined}
                className="min-h-11 font-mono"
              />
              <ErrorMessage message={errors.date} />
            </div>
          </div>

          {moves ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.action !== "sale" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="manejo-destination">Lote de destino</Label>
                  <Select
                    value={fields.destinationLotId === "" ? undefined : fields.destinationLotId}
                    onValueChange={(destinationLotId) =>
                      setFields((f) => ({ ...f, destinationLotId }))
                    }
                  >
                    <SelectTrigger
                      id="manejo-destination"
                      className="min-h-11 w-full"
                      aria-invalid={errors.destinationLotId ? true : undefined}
                    >
                      <SelectValue placeholder="Selecione o lote" />
                    </SelectTrigger>
                    <SelectContent>
                      {lots.map((lot) => (
                        <SelectItem key={lot.id} value={lot.id}>
                          {lot.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <ErrorMessage message={errors.destinationLotId} />
                </div>
              ) : null}

              {fields.action !== "transfer" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="manejo-counterparty">
                    {fields.action === "sale" ? "Comprador" : "Vendedor"} (opcional)
                  </Label>
                  <Input
                    id="manejo-counterparty"
                    value={fields.counterparty}
                    onChange={(e) =>
                      setFields((f) => ({ ...f, counterparty: e.target.value }))
                    }
                    placeholder={
                      fields.action === "sale"
                        ? "Ex.: frigorífico, leilão…"
                        : "Ex.: fazenda vizinha, leilão…"
                    }
                    className="min-h-11"
                  />
                </div>
              ) : null}

              {fields.action === "sale" ? (
                <>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <span className="text-sm font-medium text-ink">Preço</span>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(
                        [
                          ["perArroba", "Por arroba (R$/@)"],
                          ["total", "Valor fechado do lote"],
                        ] as [SalePricing, string][]
                      ).map(([pricing, label]) => (
                        <label
                          key={pricing}
                          className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-hairline px-3 text-sm text-ink"
                        >
                          <input
                            type="radio"
                            name="manejo-pricing"
                            value={pricing}
                            checked={fields.pricing === pricing}
                            onChange={() => setFields((f) => ({ ...f, pricing }))}
                            className="size-4 shrink-0 accent-brand"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-ink-soft">
                      {fields.pricing === "perArroba"
                        ? "O valor de cada animal sai do peso lido na balança, no brete."
                        : "O lote inteiro vale o valor informado, sem preço por animal."}
                    </p>
                  </div>

                  {fields.pricing === "perArroba" ? (
                    <div className="grid gap-1.5">
                      <Label htmlFor="manejo-arroba">Preço da arroba (R$/@)</Label>
                      <Input
                        id="manejo-arroba"
                        type="number"
                        min={0.01}
                        step="0.01"
                        inputMode="decimal"
                        value={fields.pricePerArroba}
                        onChange={(e) =>
                          setFields((f) => ({ ...f, pricePerArroba: e.target.value }))
                        }
                        aria-invalid={errors.pricePerArroba ? true : undefined}
                        className="min-h-11 font-mono"
                      />
                      <ErrorMessage message={errors.pricePerArroba} />
                    </div>
                  ) : (
                    <div className="grid gap-1.5">
                      <Label htmlFor="manejo-total">Valor total (R$)</Label>
                      <Input
                        id="manejo-total"
                        type="number"
                        min={0.01}
                        step="0.01"
                        inputMode="decimal"
                        value={fields.totalAmountBrl}
                        onChange={(e) =>
                          setFields((f) => ({ ...f, totalAmountBrl: e.target.value }))
                        }
                        aria-invalid={errors.totalAmountBrl ? true : undefined}
                        className="min-h-11 font-mono"
                      />
                      <ErrorMessage message={errors.totalAmountBrl} />
                    </div>
                  )}
                </>
              ) : null}

              {fields.action === "entry" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="manejo-purchase">Valor total da compra (R$)</Label>
                  <Input
                    id="manejo-purchase"
                    type="number"
                    min={0.01}
                    step="0.01"
                    inputMode="decimal"
                    value={fields.totalAmountBrl}
                    onChange={(e) =>
                      setFields((f) => ({ ...f, totalAmountBrl: e.target.value }))
                    }
                    aria-invalid={errors.totalAmountBrl ? true : undefined}
                    className="min-h-11 font-mono"
                  />
                  <ErrorMessage message={errors.totalAmountBrl} />
                </div>
              ) : null}

              {fields.action !== "sale" ? (
                <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-hairline px-3 py-2 sm:col-span-2">
                  <span className="text-sm font-medium text-ink">
                    Pesar na mesma passagem
                    <span className="block text-xs font-normal text-ink-soft">
                      O peso é digitado animal a animal, na hora do brete.
                    </span>
                  </span>
                  <Switch
                    checked={fields.weighAlso}
                    onCheckedChange={(weighAlso) => setFields((f) => ({ ...f, weighAlso }))}
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          {sanitary ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="manejo-name">Produto ou procedimento</Label>
                <Input
                  id="manejo-name"
                  value={fields.name}
                  onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex.: Vacina aftosa, Ivermectina 1%…"
                  aria-invalid={errors.name ? true : undefined}
                  className="min-h-11"
                />
                <ErrorMessage message={errors.name} />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="manejo-dose">Dose (opcional)</Label>
                <Input
                  id="manejo-dose"
                  value={fields.dose}
                  onChange={(e) => setFields((f) => ({ ...f, dose: e.target.value }))}
                  placeholder="Ex.: 5 ml"
                  className="min-h-11"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="manejo-withdrawal">Carência (dias)</Label>
                <Input
                  id="manejo-withdrawal"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={fields.withdrawalDays}
                  onChange={(e) => setFields((f) => ({ ...f, withdrawalDays: e.target.value }))}
                  aria-invalid={errors.withdrawalDays ? true : undefined}
                  className="min-h-11 font-mono"
                />
                <ErrorMessage message={errors.withdrawalDays} />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="manejo-responsible">Responsável (opcional)</Label>
                <Input
                  id="manejo-responsible"
                  value={fields.responsible}
                  onChange={(e) => setFields((f) => ({ ...f, responsible: e.target.value }))}
                  placeholder="Ex.: veterinário, vaqueiro…"
                  className="min-h-11"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="manejo-cost">Custo por animal (R$, opcional)</Label>
                <Input
                  id="manejo-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={fields.costBrl}
                  onChange={(e) => setFields((f) => ({ ...f, costBrl: e.target.value }))}
                  aria-invalid={errors.costBrl ? true : undefined}
                  className="min-h-11 font-mono"
                />
                <ErrorMessage message={errors.costBrl} />
              </div>

              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="manejo-next">Próxima aplicação (opcional)</Label>
                <Input
                  id="manejo-next"
                  type="date"
                  value={fields.nextDate}
                  onChange={(e) => setFields((f) => ({ ...f, nextDate: e.target.value }))}
                  aria-invalid={errors.nextDate ? true : undefined}
                  className="min-h-11 font-mono"
                />
                <p className="text-xs text-ink-soft">
                  Agenda o reforço desta aplicação para cada animal manejado.
                </p>
                <ErrorMessage message={errors.nextDate} />
              </div>

              <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-hairline px-3 py-2 sm:col-span-2">
                <span className="text-sm font-medium text-ink">
                  Pesar na mesma passagem
                  <span className="block text-xs font-normal text-ink-soft">
                    O peso é digitado animal a animal, na hora do brete.
                  </span>
                </span>
                <Switch
                  checked={fields.weighAlso}
                  onCheckedChange={(weighAlso) => setFields((f) => ({ ...f, weighAlso }))}
                />
              </label>
            </div>
          ) : null}

          {picksAnimals ? (
          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-sm font-medium text-ink">Selecionar animais</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <Select value={lotId} onValueChange={setLotId}>
                <SelectTrigger className="min-h-11 w-full" aria-label="Filtrar por lote">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos os lotes</SelectItem>
                  {lots.map((lot) => (
                    <SelectItem key={lot.id} value={lot.id}>
                      {lot.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as Category | typeof ALL)}
              >
                <SelectTrigger className="min-h-11 w-full" aria-label="Filtrar por categoria">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas as categorias</SelectItem>
                  {CATEGORY_LIST.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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

            {selectable.length === 0 ? (
              <p className="px-1 py-2 text-xs text-ink-soft">
                Nenhum animal ativo com os filtros atuais.
              </p>
            ) : (
              <>
                <label className="flex min-h-9 cursor-pointer items-center gap-2.5 px-1 text-xs font-medium text-ink-soft">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    className="size-4 shrink-0 accent-brand"
                  />
                  Selecionar todos os listados ({selectable.length})
                </label>
                <ul className="max-h-52 overflow-y-auto rounded-lg border border-hairline">
                  {selectable.map((animal) => (
                    <AnimalRow
                      key={animal.earTag}
                      animal={animal}
                      checked={fields.earTags.includes(animal.earTag)}
                      onToggle={() => toggleEarTag(animal.earTag)}
                    />
                  ))}
                </ul>
              </>
            )}
            {fields.earTags.length > 0 ? (
              <p className="text-xs text-ink-soft">
                {fields.earTags.length}{" "}
                {fields.earTags.length === 1 ? "animal selecionado" : "animais selecionados"}.
              </p>
            ) : null}
            <ErrorMessage message={errors.earTags} />
          </fieldset>
          ) : null}

          {sanitary || moves ? (
            <div className="grid gap-1.5">
              <Label htmlFor="manejo-notes">Observação (opcional)</Label>
              <Textarea
                id="manejo-notes"
                value={fields.notes}
                onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))}
                placeholder={
                  moves
                    ? "Ex.: nota fiscal, transporte, ajuste de lotação…"
                    : "Ex.: lote do produto, reação de algum animal…"
                }
              />
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" className="min-h-11">
              Iniciar manejo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
