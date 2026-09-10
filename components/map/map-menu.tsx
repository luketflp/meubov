"use client";

/**
 * The map's overflow menu: the two actions that are neither the guided flow nor
 * a selection — typing an outline from coordinates, and saving the current view
 * as the sede.
 *
 * Hand-rolled rather than a Radix dropdown: the repo has no dropdown primitive,
 * this needs two items, and the dismiss behaviour (outside pointer, Escape) is
 * the same pattern PlaceSearch already uses a few lines away.
 */
import { useEffect, useRef, useState } from "react";
import { House, Keyboard, MoreHorizontal } from "lucide-react";

export function MapMenu({
  hasHeadquarters,
  savingHeadquarters,
  onSaveHeadquarters,
  onTypeCoordinates,
}: {
  hasHeadquarters: boolean;
  savingHeadquarters: boolean;
  onSaveHeadquarters: () => void;
  onTypeCoordinates: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Mais opções do mapa"
        className="flex size-11 items-center justify-center rounded-lg border border-hairline bg-panel/95 text-ink shadow-md backdrop-blur-sm hover:bg-surface"
      >
        <MoreHorizontal className="size-5" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute top-full right-0 z-10 mt-1 w-60 overflow-hidden rounded-lg border border-hairline bg-panel shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => run(onTypeCoordinates)}
            className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface"
          >
            <Keyboard className="size-4 shrink-0 text-ink-soft" aria-hidden />
            Digitar coordenadas
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => run(onSaveHeadquarters)}
            disabled={savingHeadquarters}
            className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface disabled:opacity-50"
          >
            <House className="size-4 shrink-0 text-ink-soft" aria-hidden />
            {savingHeadquarters
              ? "Salvando sede…"
              : hasHeadquarters
                ? "Atualizar sede nesta vista"
                : "Definir sede aqui"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
