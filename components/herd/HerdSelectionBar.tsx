"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PurgeAnimalsDialog } from "@/components/herd/PurgeAnimalsDialog";

interface HerdSelectionBarProps {
  /** The ticked animals the list still shows. */
  selected: ReadonlySet<string>;
  /** Animals the list shows, across its pages. */
  total: number;
  onSelectAll: () => void;
  onClear: () => void;
}

/** Above the table while animals are ticked: how many, and what to do with them. */
export function HerdSelectionBar({ selected, total, onSelectAll, onClear }: HerdSelectionBarProps) {
  const count = selected.size;

  return (
    <div className="hidden min-h-12 items-center gap-4 rounded-xl border border-hairline bg-panel px-4 py-2 text-sm md:flex">
      <span className="font-medium text-ink">
        {count === 1 ? "1 animal selecionado" : `${count} animais selecionados`}
      </span>
      {count < total ? (
        <button
          type="button"
          onClick={onSelectAll}
          className="font-medium text-primary hover:underline"
        >
          Selecionar todos os {total}
        </button>
      ) : null}
      <button type="button" onClick={onClear} className="text-ink-soft hover:text-ink">
        Limpar seleção
      </button>
      <div className="ml-auto">
        <PurgeAnimalsDialog ids={selected} onDeleted={onClear}>
          <Button type="button" variant="destructive" size="sm" className="min-h-9">
            <Trash2 aria-hidden />
            Excluir
          </Button>
        </PurgeAnimalsDialog>
      </div>
    </div>
  );
}
