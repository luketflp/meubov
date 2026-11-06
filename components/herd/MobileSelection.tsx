"use client";

/**
 * The herd's selection on the phone, where the list is cards and has no
 * checkbox column. A bar on top counts the ticked animals and takes the whole
 * filter; one at the bottom, over the tab bar and in reach of the thumb, opens
 * "Excluir". The screen enters the mode from "Selecionar" or by holding a card.
 */
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PurgeAnimalsDialog } from "@/components/herd/PurgeAnimalsDialog";

const headsLabel = (heads: number) => (heads === 1 ? "1 animal" : `${heads} animais`);

interface MobileSelectionHeaderProps {
  /** Ticked animals the list still shows. */
  count: number;
  /** Animals the list shows, across its pages. */
  total: number;
  /** The filter and the head count, as one line. */
  summary: string;
  onSelectAll: () => void;
  onClearAll: () => void;
  onLeave: () => void;
}

/** Top of the screen while selecting, in place of the title and the filters. */
export function MobileSelectionHeader({
  count,
  total,
  summary,
  onSelectAll,
  onClearAll,
  onLeave,
}: MobileSelectionHeaderProps) {
  return (
    <>
      <div className="sticky top-0 z-30 -mx-4 -mt-6 flex h-14 items-center gap-1 border-b border-hairline bg-panel px-2 md:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Sair da seleção"
          onClick={onLeave}
        >
          <X aria-hidden className="size-5" />
        </Button>
        <p aria-live="polite" className="flex-1 text-base font-semibold text-ink">
          {count === 0
            ? "Nenhum selecionado"
            : count === 1
              ? "1 selecionado"
              : `${count} selecionados`}
        </p>
        {count === total ? (
          <Button type="button" variant="ghost" className="min-h-11 text-brand" onClick={onClearAll}>
            Limpar
          </Button>
        ) : (
          <Button type="button" variant="ghost" className="min-h-11 text-brand" onClick={onSelectAll}>
            Todos ({total})
          </Button>
        )}
      </div>
      <p className="-mt-1 text-[13px] text-ink-soft md:hidden">{summary}</p>
    </>
  );
}

interface MobileSelectionActionsProps {
  /** The ticked animals the list still shows. */
  selected: ReadonlySet<string>;
  /** Called after the server deleted them. */
  onDeleted: () => void;
}

/** Bottom of the screen while selecting: covers the tab bar until the mode ends. */
export function MobileSelectionActions({ selected, onDeleted }: MobileSelectionActionsProps) {
  const count = selected.size;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-hairline bg-panel px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden">
      <PurgeAnimalsDialog ids={selected} onDeleted={onDeleted}>
        <Button
          type="button"
          variant="destructive"
          className="h-12 w-full text-base"
          disabled={count === 0}
        >
          <Trash2 aria-hidden />
          {count === 0 ? "Excluir" : `Excluir ${headsLabel(count)}`}
        </Button>
      </PurgeAnimalsDialog>
    </div>
  );
}
