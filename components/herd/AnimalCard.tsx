import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import type { AnimalWithDerived } from "@/lib/store/selectors";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { animalCategoryName } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/ui/status-pill";
import { formatFullWeight } from "@/components/herd/filters";

/** Holding a card this long starts the selection with it. */
const LONG_PRESS_MS = 500;

/** A finger that travels farther than this is scrolling, not holding. */
const LONG_PRESS_SLOP_PX = 10;

interface AnimalCardProps {
  item: AnimalWithDerived;
  lotName: string;
  invernadaName: string;
  /** In selection mode the card ticks instead of opening the record. */
  selection?: { selected: boolean; onToggle: () => void };
  /** Holding the card starts the selection with it; absent, holding does nothing. */
  onLongPress?: () => void;
}

/** Animal card of the mobile list: the whole card navigates to the record, or ticks. */
export function AnimalCard({
  item,
  lotName,
  invernadaName,
  selection,
  onLongPress,
}: AnimalCardProps) {
  const { animal, status, currentWeightKg } = item;
  const customCategories = useHerdStore((s) => s.customCategories);
  const hold = useLongPress(onLongPress);

  // Spans, so the same lines fit inside the selection mode's button.
  const lines = (
    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="flex items-center justify-between gap-2">
        <span className="font-mono text-lg leading-none font-semibold text-ink">
          {animal.earTag}
        </span>
        <StatusPill status={status} withDot />
      </span>
      <span className="text-sm text-ink-soft">
        {animalCategoryName(animal, customCategories)} · {animal.breed} · {lotName}
      </span>
      <span className="text-xs text-ink-soft">Invernada {invernadaName}</span>
      <span className="font-mono text-sm text-ink">{formatFullWeight(currentWeightKg)}</span>
    </span>
  );

  if (selection) {
    return (
      <li>
        <button
          type="button"
          aria-pressed={selection.selected}
          aria-label={`Selecionar ${animal.earTag}`}
          onClick={selection.onToggle}
          className={cn(
            "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors",
            selection.selected
              ? "border-brand bg-brand-soft ring-1 ring-brand"
              : "border-hairline bg-panel active:bg-surface"
          )}
        >
          <span
            aria-hidden
            className={cn(
              "mt-px flex size-6 shrink-0 items-center justify-center rounded-md border-2",
              selection.selected
                ? "border-brand bg-brand text-primary-foreground"
                : "border-ink-soft bg-panel"
            )}
          >
            {selection.selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
          </span>
          {lines}
        </button>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={`/herd/${animal.id}`}
        aria-label={`Abrir ficha do animal ${animal.earTag}`}
        onClick={(event) => {
          // A double tap on the pager must not open the card that scrolled under it.
          if (event.detail > 1) event.preventDefault();
        }}
        {...hold}
        className={cn(
          "flex min-h-11 rounded-xl border border-hairline bg-panel p-4 transition-colors active:bg-surface",
          // Holding is ours: no text selection, no link preview on the iPhone.
          onLongPress && "select-none [-webkit-touch-callout:none]"
        )}
      >
        {lines}
      </Link>
    </li>
  );
}

/**
 * Handlers that call `onLongPress` once a finger rests on the element for
 * LONG_PRESS_MS; scrolling or lifting it first calls the hold off. The phone's
 * own long-press menu stays shut. None without `onLongPress`.
 */
function useLongPress(onLongPress: (() => void) | undefined) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const origin = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const pending = timer;
    return () => clearTimeout(pending.current);
  }, []);

  if (!onLongPress) return {};

  const cancel = () => {
    clearTimeout(timer.current);
    origin.current = null;
  };

  return {
    onPointerDown: (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      origin.current = { x: event.clientX, y: event.clientY };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        origin.current = null;
        swallowNextClick();
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (event: PointerEvent) => {
      const start = origin.current;
      if (!start) return;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved > LONG_PRESS_SLOP_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (event: MouseEvent) => event.preventDefault(),
  };
}

/**
 * The click that ends a hold reaches nothing. The screen changes under the
 * finger as the hold fires, so that click would land on whatever moved there.
 */
function swallowNextClick(): void {
  const swallow = (event: globalThis.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  // A release that brought no click must not eat the next tap's.
  window.addEventListener(
    "pointerdown",
    () => window.removeEventListener("click", swallow, { capture: true }),
    { capture: true, once: true }
  );
}
