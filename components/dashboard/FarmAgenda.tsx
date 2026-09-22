"use client";

/**
 * "Agenda da fazenda": what needs a hand, lote by lote (farmAgenda). A
 * treatment batch closes with "Concluir", as on the Manejo activity panel —
 * a manejo session writes its own treatment and would leave the scheduled one
 * pending. Calvings and diagnoses open the screen where they are recorded.
 */
import Link from "next/link";
import {
  ArrowRight,
  Baby,
  ChevronRight,
  CircleCheck,
  Dna,
  Fence,
  Syringe,
  type LucideIcon,
} from "lucide-react";
import type { Animal } from "@/lib/types";
import type { AgendaItem, AgendaLot, AgendaUrgency } from "@/lib/store/dashboard";
import { countByCategory } from "@/lib/store/selectors";
import { formatNumber } from "@/lib/domain/format";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { DOT, TonePill, ToneTile, type Tone } from "@/components/dashboard/tone";
import {
  dayMonth,
  earTagList,
  fromDayText,
  invernadaLabel,
  summaryByCategory,
  treatmentDueText,
} from "@/components/dashboard/helpers";
import { cn } from "@/lib/utils";

const URGENCY_TONE: Record<AgendaUrgency, Tone> = { 0: "overdue", 1: "attention", 2: "scheduled" };

interface FarmAgendaProps {
  lots: AgendaLot[];
  /** Active animals by ear tag, to say who an item is about ("22 bezerros"). */
  animalsByEarTag: Map<string, Animal>;
  todayIso: string;
  /** Absent without Sanitário edit: the treatment rows get no "Concluir". */
  onComplete?: (treatmentIds: string[]) => void;
}

/** What a row says and, for a calving or a diagnosis, where it leads. */
interface RowView {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  meta: string;
  pill: string;
  pillTone: Tone;
  link?: { href: string; text: string };
}

function herdOf(earTags: string[], byEarTag: Map<string, Animal>): string {
  const animals = earTags.flatMap((earTag) => byEarTag.get(earTag) ?? []);
  return summaryByCategory(countByCategory(animals));
}

function rowView(item: AgendaItem, byEarTag: Map<string, Animal>, todayIso: string): RowView {
  const count = item.earTags.length;
  const one = count === 1;
  switch (item.kind) {
    case "treatment":
      return {
        icon: Syringe,
        tone: URGENCY_TONE[item.urgency],
        title: item.name,
        meta: herdOf(item.earTags, byEarTag),
        pill: treatmentDueText(item.date, item.type, todayIso),
        pillTone: URGENCY_TONE[item.urgency],
      };
    case "overdueCalvings":
      return {
        icon: Baby,
        tone: "attention",
        title: one ? "Parto previsto sem registro" : `${count} partos previstos sem registro`,
        meta: `${one ? "Vaca" : "Vacas"} ${earTagList(item.earTags)} · ${one ? "previsto para" : "previstos até"} ${dayMonth(item.until)}`,
        pill: "Conferir",
        pillTone: "attention",
        link: { href: "/nascimentos", text: "Registrar parto" },
      };
    case "upcomingCalvings":
      return {
        icon: Baby,
        tone: "brand",
        title: one ? "Parto previsto" : `${count} partos previstos`,
        meta: `${one ? "Vaca" : "Vacas"} ${earTagList(item.earTags)} · ${item.date === item.until ? dayMonth(item.date) : `${dayMonth(item.date)} a ${dayMonth(item.until)}`}`,
        pill: fromDayText(item.date, todayIso),
        pillTone: "scheduled",
        link: { href: "/reproducao", text: "Ver matrizes" },
      };
    case "pendingDiagnosis":
      return {
        icon: Dna,
        tone: "scheduled",
        title: "Diagnóstico de gestação pendente",
        meta: `${one ? "Matriz" : "Matrizes"} ${earTagList(item.earTags)} · ${one ? "coberta" : "cobertas"} desde ${dayMonth(item.date)}`,
        pill: "Pendente",
        pillTone: "attention",
        link: { href: "/reproducao?tab=ultrassom", text: "Abrir ultrassom" },
      };
  }
}

function AgendaRow({
  item,
  view,
  lotName,
  onComplete,
}: {
  item: AgendaItem;
  view: RowView;
  lotName: string;
  onComplete?: (treatmentIds: string[]) => void;
}) {
  const body = (
    <>
      <ToneTile tone={view.tone} icon={view.icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{view.title}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">{view.meta}</span>
        <TonePill tone={view.pillTone} className="mt-1 sm:hidden">
          {view.pill}
        </TonePill>
      </span>
      <TonePill tone={view.pillTone} className="hidden sm:inline-flex">
        {view.pill}
      </TonePill>
    </>
  );

  if (view.link) {
    return (
      <li>
        <Link
          href={view.link.href}
          className="flex min-h-[60px] items-center gap-3 py-2.5 transition-colors hover:bg-surface"
        >
          {body}
          <span className="hidden w-32 shrink-0 justify-end text-sm font-medium text-brand sm:flex">
            {view.link.text}
          </span>
          <ChevronRight className="size-4 shrink-0 text-ink-soft sm:hidden" aria-hidden />
        </Link>
      </li>
    );
  }

  return (
    <li className="flex min-h-[60px] items-center gap-3 py-2.5">
      {body}
      <span className="flex shrink-0 justify-end sm:w-32">
        {onComplete && item.kind === "treatment" ? (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 text-brand md:min-h-0"
            onClick={() => onComplete(item.treatmentIds)}
            aria-label={`Concluir ${item.name} em ${lotName}`}
          >
            Concluir
          </Button>
        ) : null}
      </span>
    </li>
  );
}

function LotGroup({
  group,
  first,
  animalsByEarTag,
  todayIso,
  onComplete,
}: {
  group: AgendaLot;
  first: boolean;
} & Omit<FarmAgendaProps, "lots">) {
  const name = group.name ?? "Sem lote";
  const place = [
    group.invernada ? invernadaLabel(group.invernada) : null,
    `${formatNumber(group.heads)} cab`,
  ]
    .filter((part) => part !== null)
    .join(" · ");

  return (
    <section aria-label={name} className={cn(!first && "border-t border-hairline")}>
      <header className="flex items-center gap-2 pt-3.5 pb-1.5">
        <span
          aria-hidden
          className={cn("size-2 shrink-0 rounded-full", DOT[URGENCY_TONE[group.items[0].urgency]])}
        />
        <Fence className="size-3.5 shrink-0 text-ink-soft" aria-hidden />
        <h3 className="font-sans text-sm font-semibold whitespace-nowrap text-ink">{name}</h3>
        <span className="min-w-0 truncate text-xs text-ink-soft">{place}</span>
        {group.lotId ? (
          <Link
            href={`/lots/${group.lotId}`}
            className="ml-auto inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-brand hover:underline md:min-h-0"
          >
            Ver lote
          </Link>
        ) : null}
      </header>
      <ul className="divide-y divide-hairline border-t border-hairline">
        {group.items.map((item) => (
          <AgendaRow
            key={item.key}
            item={item}
            view={rowView(item, animalsByEarTag, todayIso)}
            lotName={name}
            onComplete={onComplete}
          />
        ))}
      </ul>
    </section>
  );
}

export function FarmAgenda({ lots, animalsByEarTag, todayIso, onComplete }: FarmAgendaProps) {
  const items = lots.flatMap((group) => group.items);
  const overdue = items.filter((item) => item.urgency === 0).length;
  const subtitle =
    items.length === 0
      ? undefined
      : `${items.length} ${items.length === 1 ? "pendência" : "pendências"} em ${lots.length} ${lots.length === 1 ? "lote" : "lotes"}${overdue > 0 ? ` · ${overdue} ${overdue === 1 ? "atrasada" : "atrasadas"}` : ""}`;

  return (
    <SectionCard
      title="Agenda da fazenda"
      subtitle={subtitle}
      action={
        <Link
          href="/calendar"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver calendário
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Nada pendente"
          description="Vacinas atrasadas, partos previstos e diagnósticos de gestação aparecem aqui, lote a lote."
        />
      ) : (
        <div className="-mt-4 -mb-1.5">
          {lots.map((group, index) => (
            <LotGroup
              key={group.lotId ?? "sem-lote"}
              group={group}
              first={index === 0}
              animalsByEarTag={animalsByEarTag}
              todayIso={todayIso}
              onComplete={onComplete}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
