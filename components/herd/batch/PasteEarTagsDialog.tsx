"use client";

/**
 * "Colar brincos": a column copied from a spreadsheet or a list from WhatsApp
 * becomes one line per brinco. Splitting and de-duplication are
 * `parseEarTagList`'s; this dialog only says what it found.
 */
import { useMemo, useState } from "react";
import { parseEarTagList } from "@/lib/domain/animalBatch";
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
import { Textarea } from "@/components/ui/textarea";

interface PasteEarTagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lines still free in the list. */
  room: number;
  onAdd: (earTags: string[]) => void;
}

/** Lives inside DialogContent, which unmounts on close: every open starts empty. */
function PasteForm({ room, onAdd }: Pick<PasteEarTagsDialogProps, "room" | "onAdd">) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseEarTagList(text), [text]);
  const found = parsed.earTags.length;
  const fitting = parsed.earTags.slice(0, room);
  const count = fitting.length;

  const notes: string[] = [];
  if (parsed.repeated.length === 1) {
    notes.push(`${parsed.repeated[0]} aparece repetido e entra uma vez só`);
  } else if (parsed.repeated.length > 1) {
    notes.push(`${parsed.repeated.length} repetidos entram uma vez só`);
  }
  if (found > room) notes.push(room === 0 ? "a lista já está cheia" : `cabem ${room}`);

  return (
    <>
      <div className="grid gap-2">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-label="Brincos"
          placeholder={"BR-2210\nBR-2214\n7731"}
          autoFocus
          className="max-h-[40dvh] min-h-40 font-mono"
        />
        {found > 0 ? (
          <p className="text-xs text-ink-soft">
            <span className="font-medium text-ink">
              {found} {found === 1 ? "brinco" : "brincos"}
            </span>
            {notes.map((note) => ` · ${note}`).join("")}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11">
            Cancelar
          </Button>
        </DialogClose>
        <Button type="button" className="min-h-11" disabled={count === 0} onClick={() => onAdd(fitting)}>
          {count === 0 ? "Adicionar linhas" : `Adicionar ${count} ${count === 1 ? "linha" : "linhas"}`}
        </Button>
      </DialogFooter>
    </>
  );
}

export function PasteEarTagsDialog({ open, onOpenChange, ...form }: PasteEarTagsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Colar brincos</DialogTitle>
          <DialogDescription>
            Cole uma coluna da planilha ou uma lista do WhatsApp. Um brinco por linha, ou
            separados por vírgula.
          </DialogDescription>
        </DialogHeader>
        <PasteForm {...form} />
      </DialogContent>
    </Dialog>
  );
}
