"use client";

/**
 * "Iniciar manejo" dialog: opens a manejo session (curral working session) for
 * the selected animals. A sanitary action (vaccine, deworming, medication,
 * exam) captures product, dose, withdrawal, responsible, cost and optional
 * booster date; weighing is a toggle (or the session itself). An inseminação
 * picks the lote and the touros first and lists only the cows it can take (see
 * insemination-fields.tsx). Nothing is applied here: the animals are
 * handled one by one on the session screen, as they pass the chute. Validation
 * is a local pure function (validateManejo).
 */
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Play, Search } from "lucide-react";
import { useHerdStore, type NewManejoSession } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { useToast } from "@/components/providers/Toasts";
import {
  activeAnimals,
  currentPlacementForLot,
  currentlyPlacedLots,
} from "@/lib/store/selectors";
import type { Animal, Category, TreatmentType } from "@/lib/types";
import { todayISO, formatAge } from "@/lib/domain/dates";
import { CATEGORY_LABEL } from "@/lib/domain/labels";
import { currentWeight } from "@/lib/domain/weights";
import { formatKg } from "@/lib/domain/format";
import { isPregnantNow } from "@/lib/domain/reproduction";
import { eligibleForInsemination } from "@/lib/domain/semen";
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
import { BullsField, BullsShortNotice } from "@/components/manejo/insemination-fields";
import { MultiFilter } from "@/components/manejo/multi-filter";
import {
  categoryCounts,
  lotCounts,
  matchesPicker,
  pickedLabel,
  togglePicked,
} from "@/components/manejo/picker-filters";
import { cn } from "@/lib/utils";

const CATEGORY_LIST = Object.keys(CATEGORY_LABEL) as Category[];

/** Number typed in a form field, or undefined when it is empty/invalid. */
function typedNumber(raw: string): number | undefined {
  const value = Number(raw.replace(",", "."));
  return raw.trim() === "" || !Number.isFinite(value) || value <= 0 ? undefined : value;
}

function createInitialFields(action: ManejoAction): ManejoFields {
  return {
    action,
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
    semenBullIds: [],
  };
}

/** "1 animal selecionado", "32 vacas selecionadas" — an inseminação counts cows. */
function selectedLabel(n: number, cows: boolean): string {
  if (cows) return n === 1 ? "1 vaca selecionada" : `${n} vacas selecionadas`;
  return n === 1 ? "1 animal selecionado" : `${n} animais selecionados`;
}

function ErrorMessage({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-overdue">{message}</p>;
}

function AnimalRow({
  animal,
  checked,
  onToggle,
  pregnant = false,
  lotName,
}: {
  animal: Animal;
  checked: boolean;
  onToggle: () => void;
  /** The animal's lote, named when the list mixes several. */
  lotName?: string;
  /** Inseminação: the cow is pregnant now, so she reads muted with "Já prenhe". */
  pregnant?: boolean;
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
          <span className={cn("font-mono font-medium", pregnant ? "text-ink-soft" : "text-ink")}>
            {animal.earTag}
          </span>
          <span className="truncate text-xs text-ink-soft">
            {CATEGORY_LABEL[animal.category]} · {lotName ? `${lotName} · ` : ""}
            {formatAge(animal.birthDate)}
          </span>
        </label>
        {pregnant ? (
          <span className="ml-auto inline-flex shrink-0 items-center rounded-md bg-healthy-soft px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-healthy">
            Já prenhe
          </span>
        ) : (
          <span className="ml-auto shrink-0 font-mono text-xs text-ink-soft">
            {lastWeight === null ? "Sem pesagem" : formatKg(lastWeight)}
          </span>
        )}
      </div>
    </li>
  );
}

/** "2 lotes", "1 categoria": the menus' footer. */
const lotsPicked = (n: number) => (n === 1 ? "1 lote" : `${n} lotes`);
const categoriesPicked = (n: number) => (n === 1 ? "1 categoria" : `${n} categorias`);

interface RegisterManejoDialogProps {
  /**
   * Action the dialog opens on ("Tipo de manejo" starts on vacina). A screen
   * that opens it for one action — Reprodução's "Iniciar inseminação" — passes
   * it, and the choice of type is not offered.
   */
  initialAction?: ManejoAction;
  /** Button that opens the dialog; "Iniciar manejo" by default. */
  trigger?: ReactNode;
}

export function RegisterManejoDialog({ initialAction, trigger }: RegisterManejoDialogProps) {
  const router = useRouter();
  const lots = useHerdStore((s) => s.lots);
  const invernadas = useHerdStore((s) => s.invernadas);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const animals = useHerdStore((s) => s.animals);
  const semenBulls = useHerdStore((s) => s.semenBulls);
  const startManejoSession = useHerdStore((s) => s.startManejoSession);
  const { addToast } = useToast();

  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<ManejoFields>(() =>
    createInitialFields(initialAction ?? "vaccine")
  );
  const [errors, setErrors] = useState<ManejoErrors>({});
  const [lotIds, setLotIds] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");

  const sanitary = isSanitaryAction(fields.action);
  const moves = isMovementAction(fields.action);
  const inseminates = fields.action === "insemination";
  // A venda, an entrada and the plan's cost are money: without Financeiro edit
  // the dialog offers none of them, since the server would refuse the start.
  const canEditFinance = useCan("finance", "edit");
  const actionList = canEditFinance
    ? MANEJO_ACTION_LIST
    : MANEJO_ACTION_LIST.filter((action) => action !== "sale" && action !== "entry");
  const destinationLots = useMemo(
    () => currentlyPlacedLots(lots, lotPlacements),
    [lots, lotPlacements]
  );
  const filterLots = useMemo(() => {
    const usedLotIds = new Set(activeAnimals(animals).map((animal) => animal.lotId));
    return lots.filter((lot) => usedLotIds.has(lot.id));
  }, [animals, lots]);
  // An entrada registers its animals at the chute, so there is nothing to pick.
  const picksAnimals = fields.action !== "entry";
  const invernadaNameByLot = useMemo(() => {
    const byId = new Map(invernadas.map((item) => [item.id, item]));
    return new Map(
      lots.map((lot) => {
        const placement = currentPlacementForLot(lot.id, lotPlacements);
        return [
          lot.id,
          placement
            ? `Inv. ${byId.get(placement.invernadaId)?.code ?? "—"}`
            : "Lote encerrado",
        ] as const;
      })
    );
  }, [invernadas, lotPlacements, lots]);

  function onOpenChange(next: boolean) {
    if (next) {
      setFields(createInitialFields(initialAction ?? "vaccine"));
      setErrors({});
      setLotIds([]);
      setCategories([]);
      setSearch("");
    }
    setOpen(next);
  }

  // The animals the menus count: an inseminação takes only the cows it can
  // inseminate, and has no categoria filter.
  const pool = useMemo(
    () => activeAnimals(animals).filter((a) => !inseminates || eligibleForInsemination(a)),
    [animals, inseminates]
  );
  const pickedCategories = useMemo(() => (inseminates ? [] : categories), [inseminates, categories]);
  const selectable = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    return pool.filter(
      (a) =>
        matchesPicker(a, { lotIds, categories: pickedCategories }) &&
        (searchTerm === "" || a.earTag.toLowerCase().includes(searchTerm))
    );
  }, [pool, lotIds, pickedCategories, search]);
  // Several lotes in the list: each row says which one it comes from.
  const lotNameById = useMemo(() => new Map(lots.map((lot) => [lot.id, lot.name])), [lots]);
  const mixesLots = new Set(selectable.map((a) => a.lotId)).size > 1;

  const byLot = lotCounts(pool, pickedCategories);
  const lotOptions = filterLots.map((lot) => ({
    value: lot.id,
    label: `${lot.name} · ${invernadaNameByLot.get(lot.id)}`,
    shortLabel: lot.name,
    count: byLot.get(lot.id) ?? 0,
  }));
  const pickedLots = lotOptions.filter((option) => lotIds.includes(option.value));
  const lotsFilter = (id?: string) => (
    <MultiFilter
      id={id}
      ariaLabel={id ? undefined : "Filtrar por lote"}
      buttonLabel={pickedLabel(
        pickedLots.map((option) => option.label),
        pickedLots.map((option) => option.shortLabel),
        "Todos os lotes",
        "lotes"
      )}
      allLabel="Todos os lotes"
      allCount={pool.filter((a) => matchesPicker(a, { lotIds: [], categories: pickedCategories })).length}
      pickedSummary={lotsPicked}
      options={lotOptions}
      picked={lotIds}
      onToggle={(lotId) => setLotIds((picked) => togglePicked(picked, lotId))}
      onClear={() => setLotIds([])}
    />
  );
  const byCategory = categoryCounts(pool, lotIds);
  const categoryOptions = CATEGORY_LIST.map((c) => ({
    value: c,
    label: CATEGORY_LABEL[c],
    shortLabel: CATEGORY_LABEL[c],
    count: byCategory.get(c) ?? 0,
  }));
  const pickedCategoryLabels = categories.map((c) => CATEGORY_LABEL[c]);

  // A cow pregnant now stays listed but out of "Selecionar todos": a dose on her
  // is wasted unless the farmer checks her on purpose.
  const pickable = inseminates
    ? selectable.filter((a) => !isPregnantNow(a.reproduction))
    : selectable;
  const allVisibleSelected =
    pickable.length > 0 && pickable.every((a) => fields.earTags.includes(a.earTag));

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
        const visible = new Set(pickable.map((a) => a.earTag));
        return { ...f, earTags: f.earTags.filter((t) => !visible.has(t)) };
      }
      const merged = new Set([...f.earTags, ...pickable.map((a) => a.earTag)]);
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
    if (inseminates) input.semenBullIds = fields.semenBullIds;
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
        {trigger ?? (
          <Button className="min-h-11">
            <Play aria-hidden />
            Iniciar manejo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{inseminates ? "Iniciar inseminação" : "Iniciar manejo"}</DialogTitle>
          <DialogDescription>
            {fields.action === "entry"
              ? "Os animais comprados entram no rebanho um a um, conforme passam no brete e recebem o brinco."
              : inseminates
                ? "Monte a lista das vacas e comece o trabalho: cada vaca é inseminada no brete, e o andamento fica salvo na sessão."
                : "Monte a lista do curral e comece o trabalho: os animais são manejados um a um no brete, e o andamento fica salvo na sessão."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {initialAction === undefined ? (
              <div className="grid gap-1.5">
                <Label htmlFor="manejo-action">Tipo de manejo</Label>
                <Select value={fields.action} onValueChange={onChangeAction}>
                  <SelectTrigger id="manejo-action" className="min-h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {actionList.map((action) => (
                      <SelectItem key={action} value={action}>
                        {MANEJO_ACTION_LABEL[action]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {canEditFinance ? null : (
                  <p className="text-xs text-ink-soft">
                    Venda e entrada (compra) ficam com quem cuida do financeiro.
                  </p>
                )}
              </div>
            ) : null}

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

            {inseminates ? (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="manejo-lot">Lote</Label>
                  {lotsFilter("manejo-lot")}
                </div>
                <BullsField
                  value={fields.semenBullIds}
                  onChange={(semenBullIds) => setFields((f) => ({ ...f, semenBullIds }))}
                  error={errors.semenBullIds}
                  // Alone on its row when the type is fixed and Data shares the row with Lote.
                  className={cn(initialAction !== undefined && "sm:col-span-2")}
                />
              </>
            ) : null}
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
                      {destinationLots.map((lot) => (
                        <SelectItem key={lot.id} value={lot.id}>
                          {lot.name} · {invernadaNameByLot.get(lot.id)}
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

              <div className={cn("grid gap-1.5", !canEditFinance && "sm:col-span-2")}>
                <Label htmlFor="manejo-responsible">Responsável (opcional)</Label>
                <Input
                  id="manejo-responsible"
                  value={fields.responsible}
                  onChange={(e) => setFields((f) => ({ ...f, responsible: e.target.value }))}
                  placeholder="Ex.: veterinário, vaqueiro…"
                  className="min-h-11"
                />
              </div>

              {canEditFinance ? (
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
              ) : null}

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
            <legend className="mb-1.5 text-sm font-medium text-ink">
              {inseminates ? "Selecionar vacas" : "Selecionar animais"}
            </legend>
            {inseminates ? null : (
            <div className="grid gap-2 sm:grid-cols-2">
              {lotsFilter()}
              <MultiFilter
                ariaLabel="Filtrar por categoria"
                buttonLabel={pickedLabel(
                  pickedCategoryLabels,
                  pickedCategoryLabels,
                  "Todas as categorias",
                  "categorias"
                )}
                allLabel="Todas as categorias"
                allCount={pool.filter((a) => matchesPicker(a, { lotIds, categories: [] })).length}
                pickedSummary={categoriesPicked}
                options={categoryOptions}
                picked={categories}
                onToggle={(c) => setCategories((picked) => togglePicked(picked, c))}
                onClear={() => setCategories([])}
              />
            </div>
            )}

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
                {inseminates
                  ? "Nenhuma vaca ou novilha ativa com os filtros atuais."
                  : "Nenhum animal ativo com os filtros atuais."}
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
                  Selecionar todos os listados ({pickable.length})
                </label>
                <ul className="max-h-52 overflow-y-auto rounded-lg border border-hairline">
                  {selectable.map((animal) => (
                    <AnimalRow
                      key={animal.earTag}
                      animal={animal}
                      checked={fields.earTags.includes(animal.earTag)}
                      onToggle={() => toggleEarTag(animal.earTag)}
                      pregnant={inseminates && isPregnantNow(animal.reproduction)}
                      lotName={mixesLots ? lotNameById.get(animal.lotId) : undefined}
                    />
                  ))}
                </ul>
              </>
            )}
            {fields.earTags.length > 0 ? (
              <p className="text-xs text-ink-soft">
                {selectedLabel(fields.earTags.length, inseminates)}.
              </p>
            ) : null}
            {inseminates && fields.semenBullIds.length > 0 ? (
              <BullsShortNotice bullIds={fields.semenBullIds} cows={fields.earTags.length} />
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
            <Button
              type="submit"
              className="min-h-11"
              // Nothing to inseminate with until a bull is registered on Reprodução.
              disabled={inseminates && semenBulls.length === 0}
            >
              {inseminates ? "Iniciar inseminação" : "Iniciar manejo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
