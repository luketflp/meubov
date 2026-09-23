"use client";

/**
 * Where the venda's animals went at the brete: the Boiada (sold, at their own
 * rendimento), the Dúvida (to decide before closing) and the Refugo (stay on
 * the farm), side by side on a wide screen and collapsible on a phone, with
 * the pulados under them.
 */
import { useState, type ComponentType, type ReactNode } from "react";
import { ArrowRight, ChevronDown, CircleHelp, House, Truck, Undo2 } from "lucide-react";
import type { ManejoSession, ManejoSessionAnimal } from "@/lib/types";
import { formatCurrency, formatKg, formatPercent } from "@/lib/domain/format";
import { passYieldPct } from "@/lib/domain/movements";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

interface SaleListsProps {
  session: ManejoSession;
  /** Chute actions allowed (open session, Manejo edit). */
  operable: boolean;
  onUndo: (earTag: string) => void;
  /** Dúvida → back to the brete with its weight and note. */
  onDecide: (entry: ManejoSessionAnimal) => void;
  /** The animal had a baixa: its row reads "Baixa" instead of the undo. */
  leftHerd: (entry: ManejoSessionAnimal) => boolean;
}

/** Boiada rows shown before "ver todos". */
const BOIADA_PREVIEW = 5;

export function SaleLists({ session, operable, onUndo, onDecide, leftHerd }: SaleListsProps) {
  const [allBoiada, setAllBoiada] = useState(false);

  const of = (outcome: ManejoSessionAnimal["outcome"]) =>
    session.animals.filter((a) => a.outcome === outcome);
  // Newest first: the last animal sent to the boiada tops the list.
  const boiada = of("done").reverse();
  const held = of("held");
  const rejected = of("rejected");
  const skipped = of("skipped");

  const priced = session.pricePerArroba !== undefined;
  const totalKg = boiada.reduce((sum, a) => sum + (a.weightKg ?? 0), 0);
  const anyAmount = boiada.some((a) => a.amountBrl !== undefined);
  const totalBrl = boiada.reduce((sum, a) => sum + (a.amountBrl ?? 0), 0);
  const shownBoiada = allBoiada ? boiada : boiada.slice(0, BOIADA_PREVIEW);

  // The row's end: undo, or "Baixa" when the animal already left the herd.
  const undo = (entry: ManejoSessionAnimal) =>
    !operable ? null : leftHerd(entry) ? (
      <span className="text-xs font-medium text-ink-soft">Baixa</span>
    ) : (
      <Button
        variant="ghost"
        size="icon"
        className="size-11 text-ink-soft hover:text-brand md:size-8"
        onClick={() => onUndo(entry.earTag)}
        aria-label={`Desfazer ${entry.earTag}`}
      >
        <Undo2 aria-hidden />
      </Button>
    );

  return (
    <>
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ListCard
          tone="brand"
          icon={Truck}
          title="Boiada"
          count={boiada.length}
          sub={
            <>
              {formatKg(totalKg)}
              {anyAmount ? (
                <>
                  {" · "}
                  <span className="font-mono font-medium text-ink">{formatCurrency(totalBrl)}</span>
                </>
              ) : null}
            </>
          }
          className="sm:col-span-2 lg:col-span-1"
        >
          {boiada.length === 0 ? (
            <Empty />
          ) : (
            <>
              <ul className="divide-y divide-hairline">
                {shownBoiada.map((entry) => (
                  <li key={entry.earTag} className="flex min-h-11 items-center gap-2 py-2">
                    <span className="font-mono text-sm font-medium text-ink">{entry.earTag}</span>
                    {entry.weightKg !== undefined ? (
                      <span className="font-mono text-xs text-ink-soft">
                        {formatKg(entry.weightKg)}
                      </span>
                    ) : null}
                    {priced ? (
                      <span
                        className={cn(
                          "font-mono text-xs",
                          entry.carcassYieldPct !== undefined
                            ? "font-medium text-attention"
                            : "text-ink-soft"
                        )}
                      >
                        {formatPercent(passYieldPct(session, entry))}
                      </span>
                    ) : null}
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      {entry.amountBrl !== undefined ? (
                        <span className="font-mono text-xs text-ink">
                          {formatCurrency(entry.amountBrl)}
                        </span>
                      ) : null}
                      {undo(entry)}
                    </span>
                  </li>
                ))}
              </ul>
              {boiada.length > BOIADA_PREVIEW ? (
                <button
                  type="button"
                  className="mt-1 min-h-11 text-xs font-medium text-brand hover:underline md:min-h-9"
                  onClick={() => setAllBoiada((all) => !all)}
                >
                  {allBoiada ? "mostrar menos" : `ver todos (${boiada.length})`}
                </button>
              ) : null}
            </>
          )}
        </ListCard>

        {/* First on a phone: the dúvidas are what is still to decide. */}
        <ListCard
          tone="attention"
          icon={CircleHelp}
          title="Dúvida"
          count={held.length}
          sub="Decidir leva o animal de volta ao brete, com o peso já lido."
          defaultOpen
          className="order-first sm:order-none"
        >
          {held.length === 0 ? (
            <Empty />
          ) : (
            <ul className="divide-y divide-hairline">
              {held.map((entry) => (
                <li key={entry.earTag} className="flex min-h-11 items-center gap-3 py-2">
                  <span className="font-mono text-sm font-medium text-ink">{entry.earTag}</span>
                  <span className="flex min-w-0 flex-col">
                    {entry.weightKg !== undefined ? (
                      <span className="font-mono text-xs text-ink-soft">
                        {formatKg(entry.weightKg)}
                      </span>
                    ) : null}
                    {entry.notes ? (
                      <span className="truncate text-xs text-ink-soft">{entry.notes}</span>
                    ) : null}
                  </span>
                  {!operable ? null : leftHerd(entry) ? (
                    // The animal had a baixa elsewhere: the brete cannot take it,
                    // so the dúvida is only cleared (back to pending) to let the
                    // venda close.
                    <button
                      type="button"
                      className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1 rounded-[10px] border border-hairline px-2.5 text-sm font-medium text-ink-soft hover:text-ink md:min-h-9"
                      onClick={() => onUndo(entry.earTag)}
                    >
                      Baixa · tirar da dúvida
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1 rounded-[10px] border border-attention/30 bg-attention-soft px-2.5 text-sm font-medium text-attention md:min-h-9"
                      onClick={() => onDecide(entry)}
                    >
                      Decidir
                      <ArrowRight className="size-3.5" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ListCard>

        <ListCard
          tone="fmd"
          icon={House}
          title="Refugo"
          count={rejected.length}
          sub="Continuam no rebanho; o peso fica registrado."
        >
          {rejected.length === 0 ? (
            <Empty />
          ) : (
            <ul className="divide-y divide-hairline">
              {rejected.map((entry) => (
                <li key={entry.earTag} className="flex min-h-11 items-center gap-2 py-2">
                  <span className="font-mono text-sm font-medium text-ink">{entry.earTag}</span>
                  {entry.weightKg !== undefined ? (
                    <span className="shrink-0 font-mono text-xs text-ink-soft">
                      {formatKg(entry.weightKg)}
                    </span>
                  ) : null}
                  {entry.notes ? (
                    <span className="truncate text-xs text-ink-soft">{entry.notes}</span>
                  ) : null}
                  <span className="ml-auto shrink-0">{undo(entry)}</span>
                </li>
              ))}
            </ul>
          )}
        </ListCard>
      </div>

      {skipped.length > 0 ? (
        <SectionCard title={`Pulados (${skipped.length})`}>
          <ul className="-my-1 divide-y divide-hairline">
            {skipped.map((entry) => (
              <li key={entry.earTag} className="flex min-h-11 items-center gap-2 px-1 py-2">
                <span className="font-mono text-sm font-medium text-ink">{entry.earTag}</span>
                {entry.notes ? (
                  <span className="truncate text-xs text-ink-soft">{entry.notes}</span>
                ) : null}
                <span className="ml-auto shrink-0">{undo(entry)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </>
  );
}

const TONE = {
  brand: { bar: "bg-brand", badge: "bg-brand-soft text-brand", icon: "text-brand" },
  attention: {
    bar: "bg-attention",
    badge: "bg-attention-soft text-attention",
    icon: "text-attention",
  },
  fmd: { bar: "bg-fmd", badge: "bg-fmd-soft text-fmd", icon: "text-fmd" },
} as const;

/**
 * One of the venda's lists: a card topped by its tone's bar, always open on a
 * wide screen and folded behind its header on a narrower one.
 */
function ListCard({
  tone,
  icon: Icon,
  title,
  count,
  sub,
  defaultOpen = false,
  className,
  children,
}: {
  tone: keyof typeof TONE;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  count: number;
  sub: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const styles = TONE[tone];

  return (
    <section
      className={cn("overflow-hidden rounded-[10px] border border-hairline bg-panel", className)}
    >
      <div className={cn("h-1", styles.bar)} aria-hidden />
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-start gap-2 px-4 pt-3 pb-2 text-left lg:pointer-events-none"
      >
        <Icon className={cn("mt-0.5 size-4 shrink-0", styles.icon)} aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="font-heading text-base font-semibold text-ink">{title}</span>
            <span className={cn("rounded-full px-1.5 font-mono text-xs", styles.badge)}>
              {count}
            </span>
          </span>
          <span className="text-xs text-ink-soft">{sub}</span>
        </span>
        <ChevronDown
          className={cn("mt-1 size-4 shrink-0 text-ink-soft transition-transform lg:hidden", open && "rotate-180")}
          aria-hidden
        />
      </button>
      <div className={cn(open ? "block" : "hidden", "border-t border-hairline px-4 pb-2 lg:block")}>
        {children}
      </div>
    </section>
  );
}

function Empty() {
  return <p className="py-1 text-xs text-ink-soft">Nenhum animal.</p>;
}
