"use client";

/**
 * The frame every manejo details page shares: a header with the manejo's type
 * and the way out, a resumo card, and an animals card with the scope switch,
 * the brinco search and a table on desktop / cards on the phone. The pages only
 * decide what goes in each.
 */
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardX, Search, Trash2 } from "lucide-react";
import type { Animal, ManejoSession } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useActivePermissions } from "@/lib/store/usePermissions";
import { canDeleteManejo } from "@/lib/domain/moneyRedaction";
import { formatDate } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { animalCategoryName } from "@/lib/domain/labels";
import { visibleLines, type DetailLine, type DetailScope } from "@/lib/domain/manejoDetail";
import type { ManejoAction } from "@/components/manejo/helpers";
import { ManejoTypePill } from "@/components/manejo/manejo-type-pill";
import { DeleteManejoDialog, type DeleteTarget } from "@/components/manejo/delete-manejo-dialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { ExportMenu, type ExportFormat } from "@/components/export/ExportMenu";
import type { DetailExportNames } from "@/lib/export/datasets/manejo";
import type { ExportTable } from "@/lib/export/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { SummaryRow } from "@/components/ui/summary-row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** "+46 kg", "−5 kg", "0 kg". */
export function signedKg(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "\u2212" : "";
  return `${sign}${formatNumber(Math.abs(n))} kg`;
}

/** Ganho médio diário with three decimals: "0,479", "−0,052". */
export function formatAdg(n: number): string {
  return `${n < 0 ? "\u2212" : ""}${formatNumber(Math.abs(n), 3)}`;
}

/** "18/05" inside the manejo's year, the full date otherwise. */
export function shortDate(iso: string, referenceIso: string): string {
  const full = formatDate(iso);
  return iso.slice(0, 4) === referenceIso.slice(0, 4) ? full.slice(0, 5) : full;
}

/**
 * Lead line of a resumo: "38 cabeças pesadas de 40 · 2 puladas". `participle`
 * is the plural ("pesadas"); the "de N" and the skipped/pending parts only show
 * when someone did not pass.
 */
export function HeadsLead({
  passed,
  total,
  skipped,
  participle,
}: {
  passed: number;
  total: number;
  skipped: number;
  participle: string;
}) {
  const pending = total - passed - skipped;
  const heads = passed === 1 ? `1 cabeça ${participle.replace(/s$/, "")}` : `${formatNumber(passed)} cabeças ${participle}`;
  return (
    <>
      <span className="font-medium text-ink">{heads}</span>
      {passed < total ? ` de ${formatNumber(total)}` : ""}
      {skipped > 0 ? ` · ${skipped === 1 ? "1 pulada" : `${formatNumber(skipped)} puladas`}` : ""}
      {pending > 0 ? ` · ${pending === 1 ? "1 não passou" : `${formatNumber(pending)} não passaram`}` : ""}
    </>
  );
}

/** The herd as the details pages read it: animals by brinco, lote names, categoria labels. */
export function useHerdLookup() {
  const animals = useHerdStore((s) => s.animals);
  const lots = useHerdStore((s) => s.lots);
  const customCategories = useHerdStore((s) => s.customCategories);
  return useMemo(() => {
    const byTag = new Map(animals.map((animal) => [animal.earTag, animal]));
    const lotById = new Map(lots.map((lot) => [lot.id, lot.name]));
    return {
      animal: (earTag: string): Animal | undefined => byTag.get(earTag),
      /** Lote name; "—" without a lote, "Lote excluído" when it is gone from the store. */
      lotName: (lotId: string | null | undefined): string =>
        lotId ? (lotById.get(lotId) ?? "Lote excluído") : "—",
      categoryName: (animal: Animal | undefined): string =>
        animal ? animalCategoryName(animal, customCategories) : "—",
    };
  }, [animals, lots, customCategories]);
}

/** The herd the exports of a details page read categoria, raça and lote from. */
export function useDetailExportNames(): DetailExportNames {
  const animals = useHerdStore((s) => s.animals);
  const lots = useHerdStore((s) => s.lots);
  const customCategories = useHerdStore((s) => s.customCategories);
  return useMemo(
    () => ({ animals, lotNames: new Map(lots.map((lot) => [lot.id, lot.name])), customCategories }),
    [animals, lots, customCategories]
  );
}

const animalsLabel = (n: number) => (n === 1 ? "1 animal" : `${formatNumber(n)} animais`);

/**
 * Exportar of a details page: the animals the card lists now (its scope and
 * search), and every animal of the manejo when those narrow the list.
 */
export function LinesExportMenu<T>({
  title,
  lines,
  visible,
  build,
  formats,
}: {
  title: string;
  /** Every line of the manejo. */
  lines: readonly T[];
  /** The lines the animals card shows now. */
  visible: readonly T[];
  build: (lines: readonly T[]) => ExportTable;
  formats?: readonly ExportFormat[];
}) {
  return (
    <ExportMenu
      title={title}
      formats={formats}
      current={{
        label: "Lista atual",
        detail: animalsLabel(visible.length),
        build: () => [build(visible)],
      }}
      all={
        visible.length === lines.length
          ? undefined
          : { label: "Todos os animais do manejo", detail: animalsLabel(lines.length), build: () => [build(lines)] }
      }
      hint="Os animais do manejo, com as colunas da tabela."
    />
  );
}

/** "Voltar ao manejo", in every header and on the dead ends. */
export function BackToManejo() {
  return (
    <Link
      href="/manejo"
      className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Voltar ao manejo
    </Link>
  );
}

/** A details URL with nothing behind it. */
export function NotFoundCard({ title, description }: { title: string; description: string }) {
  return (
    <SectionCard title={title}>
      <EmptyState icon={ClipboardX} title={title} description={description} />
      <div className="mt-3">
        <BackToManejo />
      </div>
    </SectionCard>
  );
}

interface DetailHeaderProps {
  title: string;
  action: ManejoAction;
  subtitle: string;
  /** The session behind the page; its "Excluir manejo" deletes it. */
  session?: ManejoSession;
  /**
   * What "Excluir manejo" deletes on a page with no session: a day of loose
   * weighings or a group of calendar treatments. Without either, no button.
   */
  deleteTarget?: DeleteTarget;
  /** More header actions, before "Excluir manejo": the Exportar, the Romaneio. */
  extra?: ReactNode;
}

export function DetailHeader({ title, action, subtitle, session, deleteTarget, extra }: DetailHeaderProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const permissions = useActivePermissions();
  const target: DeleteTarget | undefined =
    deleteTarget ?? (session ? { kind: "session", session } : undefined);
  const deletable = target !== undefined && canDeleteManejo(permissions, target);
  return (
    <>
      <PageHeader
        title={title}
        badges={<ManejoTypePill action={action} />}
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {extra}
            {deletable ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 text-ink-soft hover:text-overdue md:min-h-9"
                onClick={() => setDeleting(true)}
              >
                <Trash2 data-icon="inline-start" aria-hidden />
                Excluir manejo
              </Button>
            ) : null}
            <BackToManejo />
          </div>
        }
      />
      {target ? (
        <DeleteManejoDialog
          target={target}
          open={deleting}
          onOpenChange={setDeleting}
          onDeleted={() => router.push("/manejo")}
        />
      ) : null}
    </>
  );
}

export interface ResumoRow {
  label: string;
  value: ReactNode;
  suffix?: string;
}

export interface ResumoColumn {
  caption: string;
  rows: ResumoRow[];
}

/** The resumo: a lead line over two columns of label/value rows. Empty columns drop out. */
export function ResumoCard({
  title,
  lead,
  columns,
}: {
  title: string;
  lead: ReactNode;
  columns: ResumoColumn[];
}) {
  const filled = columns.filter((column) => column.rows.length > 0);
  return (
    <SectionCard title={title}>
      <p className={cn("text-sm text-ink-soft", filled.length > 0 && "mb-3")}>{lead}</p>
      {filled.length > 0 ? (
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {filled.map((column) => (
            <dl key={column.caption} className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                {column.caption}
              </p>
              {column.rows.map((row) => (
                <SummaryRow key={row.label} label={row.label} value={row.value} suffix={row.suffix} />
              ))}
            </dl>
          ))}
        </div>
      ) : null}
    </SectionCard>
  );
}

/** Scope and search state of an animals card, and what it has to say about them. */
export function useLinesView<T extends DetailLine>(lines: T[], scoped: boolean) {
  const [scope, setScope] = useState<DetailScope>("passed");
  const [search, setSearch] = useState("");
  const effective: DetailScope = scoped ? scope : "lot";
  const passed = lines.filter((line) => line.outcome === "done").length;
  const visible = visibleLines(lines, effective, search);
  const countLabel =
    effective === "passed" && passed < lines.length
      ? `${formatNumber(passed)} de ${formatNumber(lines.length)}`
      : formatNumber(lines.length);
  const message =
    lines.length === 0
      ? "Nenhum animal neste manejo."
      : effective === "passed" && passed === 0
        ? "Nenhum animal passou no brete. Veja todo o lote."
        : visible.length === 0
          ? "Nenhum brinco corresponde à busca."
          : null;
  return { scope, setScope, search, setSearch, visible, countLabel, message };
}

export interface LineColumn<T> {
  header: string;
  cell: (line: T) => ReactNode;
  align?: "right";
  className?: string;
}

interface AnimalsCardProps<T extends DetailLine> {
  view: ReturnType<typeof useLinesView<T>>;
  /** Show the Passaram / Todo o lote switch (sessions only). */
  scoped: boolean;
  /** Label of the "passed" scope; the venda says "Vendidos". */
  passedScopeLabel?: string;
  columns: LineColumn<T>[];
  /** One phone card per line. */
  card: (line: T) => ReactNode;
}

export function AnimalsCard<T extends DetailLine>({
  view,
  scoped,
  passedScopeLabel = "Passaram",
  columns,
  card,
}: AnimalsCardProps<T>) {
  return (
    <SectionCard
      title={`Animais (${view.countLabel})`}
      action={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {scoped ? (
            <Select value={view.scope} onValueChange={(v) => view.setScope(v as DetailScope)}>
              <SelectTrigger className="min-h-11 md:min-h-9" aria-label="Filtrar os animais do manejo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="passed">{passedScopeLabel}</SelectItem>
                <SelectItem value="lot">Todo o lote</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
              aria-hidden
            />
            <Input
              type="search"
              value={view.search}
              onChange={(e) => view.setSearch(e.target.value)}
              placeholder="Buscar brinco"
              aria-label="Buscar animal por brinco"
              className="min-h-11 pl-9 font-mono md:min-h-9"
            />
          </div>
        </div>
      }
    >
      {view.message ? (
        <p className="py-1 text-xs text-ink-soft">{view.message}</p>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead
                      key={column.header}
                      className={column.align === "right" ? "text-right" : undefined}
                    >
                      {column.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.visible.map((line, index) => (
                  <TableRow key={`${line.earTag}-${index}`}>
                    {columns.map((column) => (
                      <TableCell
                        key={column.header}
                        className={cn(column.align === "right" && "text-right", column.className)}
                      >
                        {column.cell(line)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: stacked cards */}
          <ul className="space-y-3 md:hidden">
            {view.visible.map((line, index) => (
              <li
                key={`${line.earTag}-${index}`}
                className="rounded-lg border border-hairline bg-surface p-4"
              >
                {card(line)}
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
