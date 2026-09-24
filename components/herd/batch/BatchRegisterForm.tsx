"use client";

/**
 * "Cadastrar vários animais" (/herd/cadastrar-varios): the padrão of the group,
 * the list of lines, the bar that saves them and the guard against leaving with
 * lines typed. Every rule is in lib/domain/animalBatch; this component holds
 * the state, wires the pieces and talks to the store.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardPaste, ListOrdered, Plus, Tags, Trash2, TriangleAlert } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { todayISO } from "@/lib/domain/dates";
import { impliedSex } from "@/lib/domain/herdImport";
import {
  BATCH_MAX_ROWS,
  appendEarTags,
  batchPayloads,
  isBlankRow,
  removeProblemRows,
  resolveCategory,
  validateBatch,
  withOverride,
  type BatchDefaultErrors,
  type BatchDefaults,
  type BatchRow,
} from "@/lib/domain/animalBatch";
import { activeLots, currentlyPlacedLots } from "@/lib/store/selectors";
import { animalPrerequisites, blocksRegistration } from "@/components/herd/prerequisites";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { BatchDefaultsCard } from "@/components/herd/batch/BatchDefaultsCard";
import { BatchRowCard } from "@/components/herd/batch/BatchRowCard";
import { BatchRowsTable } from "@/components/herd/batch/BatchRowsTable";
import { EarTagSequenceDialog } from "@/components/herd/batch/EarTagSequenceDialog";
import { PasteEarTagsDialog } from "@/components/herd/batch/PasteEarTagsDialog";
import { useBatchOptions, type BatchRowHandlers } from "@/components/herd/batch/BatchFieldSelects";

const EMPTY_DEFAULTS: BatchDefaults = {
  category: "",
  breed: "",
  sex: "",
  birthDate: "",
  lotId: "",
  weightKg: "",
};

let lastRowKey = 0;
const newRowKey = (): string => `row-${++lastRowKey}`;

const blankRow = (key: string): BatchRow => ({ key, earTag: "", weightKg: "", overrides: {} });

/** Lines the list still accepts: blank lines at the end are replaced on append. */
function roomLeft(rows: readonly BatchRow[]): number {
  let end = rows.length;
  while (end > 0 && isBlankRow(rows[end - 1])) end -= 1;
  return Math.max(BATCH_MAX_ROWS - end, 0);
}

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

export function BatchRegisterForm() {
  const router = useRouter();
  const { addToast } = useToast();

  const animals = useHerdStore((s) => s.animals);
  const breeds = useHerdStore((s) => s.breeds);
  const lots = useHerdStore((s) => s.lots);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const customCategories = useHerdStore((s) => s.customCategories);
  const addAnimals = useHerdStore((s) => s.addAnimals);
  const options = useBatchOptions();

  const [defaults, setDefaults] = useState<BatchDefaults>(EMPTY_DEFAULTS);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Brincos the server refused after the page loaded its herd. */
  const [taken, setTaken] = useState<string[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ key: string } | null>(null);
  const [sequenceOpen, setSequenceOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  // Enter on a brinco needs the current list without rebuilding every handler.
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const existingEarTags = useMemo(
    () => [...animals.map((animal) => animal.earTag), ...taken],
    [animals, taken]
  );

  const validation = useMemo(
    () =>
      validateBatch(rows, defaults, {
        existingEarTags,
        customCategories,
        todayIso: todayISO(),
      }),
    [rows, defaults, existingEarTags, customCategories]
  );

  const prerequisites = useMemo(
    () => animalPrerequisites(breeds, activeLots(lots), currentlyPlacedLots(lots, lotPlacements)),
    [breeds, lots, lotPlacements]
  );
  const blocked = blocksRegistration(prerequisites);

  const defaultCategory = resolveCategory(defaults.category, customCategories);
  const defaultSexLocked = defaultCategory ? impliedSex(defaultCategory.category) !== null : false;

  // A missing padrão field waits for the first save; a typed one that is wrong shows at once.
  const shownDefaultErrors: BatchDefaultErrors = Object.fromEntries(
    Object.entries(validation.defaults).filter(
      ([field]) => attempted || defaults[field as keyof BatchDefaults] !== ""
    )
  );

  const dirty = rows.some((row) => !isBlankRow(row));
  const room = roomLeft(rows);

  useEffect(() => {
    if (!focusRequest) return;
    const inputs = document.querySelectorAll<HTMLInputElement>(
      `[data-batch-eartag="${focusRequest.key}"]`
    );
    // The table and the cards both render; only one of them is visible.
    Array.from(inputs)
      .find((input) => input.offsetParent !== null)
      ?.focus();
  }, [focusRequest]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const addRow = useCallback(() => {
    if (rowsRef.current.length >= BATCH_MAX_ROWS) return;
    const key = newRowKey();
    setRows((current) => [...current, blankRow(key)]);
    setFocusRequest({ key });
  }, []);

  const handlers = useMemo<BatchRowHandlers>(() => {
    const update = (key: string, change: (row: BatchRow) => BatchRow) =>
      setRows((current) => current.map((row) => (row.key === key ? change(row) : row)));
    return {
      onEarTag: (key, value) => update(key, (row) => ({ ...row, earTag: value })),
      onWeight: (key, value) => update(key, (row) => ({ ...row, weightKg: value })),
      onOverride: (key, field, value) =>
        update(key, (row) => withOverride(row, field, value, defaults, customCategories)),
      onRemove: (key) => setRows((current) => current.filter((row) => row.key !== key)),
      onEarTagEnter: (key) => {
        const current = rowsRef.current;
        const next = current[current.findIndex((row) => row.key === key) + 1];
        if (next) setFocusRequest({ key: next.key });
        else addRow();
      },
    };
  }, [defaults, customCategories, addRow]);

  const toggleCard = useCallback((key: string) => {
    setExpandedKey((current) => (current === key ? null : key));
  }, []);

  function changeDefault(field: keyof BatchDefaults, value: string) {
    setDefaults((current) => {
      const next = { ...current, [field]: value };
      if (field === "category") {
        const resolved = resolveCategory(value, customCategories);
        const implied = resolved ? impliedSex(resolved.category) : null;
        if (implied) next.sex = implied;
      }
      return next;
    });
  }

  function appendTags(earTags: string[]) {
    const result = appendEarTags(rows, earTags, newRowKey);
    setRows(result.rows);
    setSequenceOpen(false);
    setPasteOpen(false);
    if (result.dropped > 0) {
      addToast({
        messageType: "warning",
        text: `${plural(result.dropped, "brinco ficou", "brincos ficaram")} de fora: a lista vai até ${BATCH_MAX_ROWS} linhas.`,
      });
    }
  }

  function leave() {
    if (dirty) setLeaveOpen(true);
    else router.push("/herd");
  }

  async function save() {
    if (busy || blocked) return;
    setAttempted(true);
    if (!validation.valid) return;
    setBusy(true);
    try {
      const result = await addAnimals(batchPayloads(rows, defaults, customCategories));
      if ("duplicates" in result) {
        if (result.duplicates.length === 0) {
          addToast({
            messageType: "error",
            text: "Um dos brincos acabou de ser cadastrado. Recarregue a página e tente de novo.",
          });
        } else {
          setTaken((current) => [...current, ...result.duplicates]);
        }
        return;
      }
      addToast({
        messageType: "success",
        text: plural(result.added, "animal cadastrado", "animais cadastrados"),
      });
      router.push("/herd");
    } catch {
      // addAnimals already showed the error toast.
    } finally {
      setBusy(false);
    }
  }

  const count = validation.filledCount;
  const rowProblems = validation.problemRows;
  const padraoProblems = attempted && Object.keys(validation.defaults).length > 0;
  const saveDisabled = busy || blocked || count === 0 || rowProblems > 0 || padraoProblems;

  const fillButtons = (className?: string) => (
    <>
      <Button type="button" variant="outline" onClick={() => setSequenceOpen(true)} disabled={room === 0} className={className}>
        <ListOrdered aria-hidden />
        Gerar sequência
      </Button>
      <Button type="button" variant="outline" onClick={() => setPasteOpen(true)} disabled={room === 0} className={className}>
        <ClipboardPaste aria-hidden />
        Colar brincos
      </Button>
    </>
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-6 pb-40 md:px-8">
      <div>
        <Link
          href="/herd"
          onNavigate={(event) => {
            if (dirty) {
              event.preventDefault();
              setLeaveOpen(true);
            }
          }}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink md:min-h-0"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Rebanho
        </Link>
      </div>

      <PageHeader
        title="Cadastrar vários animais"
        subtitle="Preencha o padrão do grupo uma vez e liste os brincos. Mude só o que for diferente em cada linha."
      />

      <BatchDefaultsCard
        defaults={defaults}
        errors={shownDefaultErrors}
        options={options}
        prerequisites={prerequisites}
        sexLocked={defaultSexLocked}
        onChange={changeDefault}
      />

      <section className="rounded-lg border border-hairline bg-panel">
        <header className="flex min-h-[49px] flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3">
          <div className="flex items-baseline gap-2">
            <h2 className="font-heading text-base font-semibold text-ink">Animais</h2>
            {count > 0 ? <span className="font-mono text-[13px] text-ink-soft">{count}</span> : null}
          </div>
          {rows.length > 0 ? <div className="hidden items-center gap-2 md:flex">{fillButtons()}</div> : null}
        </header>

        {rows.length === 0 ? (
          <div className="pb-10">
            <EmptyState
              icon={Tags}
              title="Nenhum brinco na lista"
              description="Gere uma sequência numerada, cole os brincos de uma planilha ou digite o primeiro."
              className="pb-4"
            />
            <div className="flex flex-wrap justify-center gap-2 px-4">
              {fillButtons("min-h-11 md:min-h-0")}
              <Button type="button" variant="outline" onClick={addRow} className="min-h-11 md:min-h-0">
                <Plus aria-hidden />
                Digitar brinco
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <BatchRowsTable
                rows={rows}
                errors={validation.rows}
                defaults={defaults}
                options={options}
                customCategories={customCategories}
                handlers={handlers}
                onAddRow={addRow}
              />
            </div>
            <div className="flex flex-col gap-3 p-4 md:hidden">
              <div className="grid grid-cols-2 gap-2">{fillButtons("min-h-11 w-full")}</div>
              <ul className="flex flex-col gap-2">
                {rows.map((row, index) => (
                  <BatchRowCard
                    key={row.key}
                    row={row}
                    line={index + 1}
                    errors={validation.rows[index] ?? {}}
                    defaults={defaults}
                    options={options}
                    customCategories={customCategories}
                    handlers={handlers}
                    expanded={expandedKey === row.key}
                    onToggle={toggleCard}
                  />
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                onClick={addRow}
                disabled={rows.length >= BATCH_MAX_ROWS}
                className="min-h-11 w-full"
              >
                <Plus aria-hidden />
                Adicionar linha
              </Button>
            </div>
          </>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-[calc(3.125rem+env(safe-area-inset-bottom))] z-30 border-t border-hairline bg-panel/95 backdrop-blur-sm md:bottom-0 md:left-60">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between md:px-8 md:py-3">
          <div className="min-w-0 text-center sm:text-left">
            {count === 0 ? (
              <p className="text-sm text-ink-soft">Nenhum animal na lista</p>
            ) : rowProblems > 0 ? (
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:justify-start">
                <p className="flex items-center gap-1.5 text-sm font-medium text-overdue">
                  <TriangleAlert aria-hidden className="size-4" />
                  {plural(rowProblems, "linha com problema", "linhas com problema")}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRows(removeProblemRows(rows, validation))}
                  className="min-h-11 text-ink-soft md:min-h-0"
                >
                  <Trash2 aria-hidden />
                  {rowProblems === 1 ? "Remover essa linha" : "Remover essas linhas"}
                </Button>
              </div>
            ) : padraoProblems ? (
              <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-overdue sm:justify-start">
                <TriangleAlert aria-hidden className="size-4" />
                Complete o padrão do grupo
              </p>
            ) : (
              <p className="text-sm text-ink-soft">
                <span className="font-medium text-ink">{plural(count, "animal", "animais")}</span>{" "}
                {count === 1 ? "pronto" : "prontos"}
                {validation.weighedCount > 0 ? (
                  <>
                    {` · ${validation.weighedCount} com peso`}
                    <span className="hidden sm:inline">, registrado como a primeira pesagem</span>
                  </>
                ) : null}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" onClick={leave} className="hidden min-h-11 sm:inline-flex">
              Cancelar
            </Button>
            <Button type="button" onClick={save} disabled={saveDisabled} className="min-h-11 flex-1 sm:flex-none">
              {busy
                ? "Cadastrando…"
                : count === 0
                  ? "Cadastrar animais"
                  : `Cadastrar ${plural(count, "animal", "animais")}`}
            </Button>
          </div>
        </div>
      </div>

      <EarTagSequenceDialog
        open={sequenceOpen}
        onOpenChange={setSequenceOpen}
        room={room}
        existingEarTags={existingEarTags}
        onAdd={appendTags}
      />
      <PasteEarTagsDialog open={pasteOpen} onOpenChange={setPasteOpen} room={room} onAdd={appendTags} />

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Descartar a lista?</DialogTitle>
            <DialogDescription>
              {count === 1
                ? "O animal preenchido não foi cadastrado."
                : `Os ${count} animais preenchidos não foram cadastrados.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Continuar editando
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              onClick={() => {
                setLeaveOpen(false);
                router.push("/herd");
              }}
            >
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
