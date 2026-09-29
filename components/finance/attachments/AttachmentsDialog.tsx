"use client";

/** "Ver anexos": the photos and PDFs of a lançamento, each opening in a new tab. */
import { useEffect, useState } from "react";
import type { Attachment, Expense } from "@/lib/types";
import { fileCountLabel } from "@/lib/domain/attachments";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { SavedAttachmentTile } from "@/components/finance/attachments/AttachmentTile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AttachmentsDialog({
  expense,
  onOpenChange,
}: {
  expense: Expense;
  onOpenChange(open: boolean): void;
}) {
  const attachmentsEnabled = useHerdStore((s) => s.attachmentsEnabled);
  const listAttachments = useHerdStore((s) => s.listAttachments);
  const [list, setList] = useState<Attachment[] | null>(null);
  /** "disabled": no Blob store here; "offline": the status check failed, so no signal. */
  const [unavailable, setUnavailable] = useState<"disabled" | "offline" | null>(null);

  useEffect(() => {
    let cancelled = false;
    attachmentsEnabled()
      .then(async (enabled) => {
        if (enabled !== true) {
          if (!cancelled) setUnavailable(enabled === false ? "disabled" : "offline");
          return;
        }
        const found = await listAttachments(expense.id);
        if (!cancelled) setList(found);
      })
      .catch(() => {
        if (!cancelled) setList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [expense.id, attachmentsEnabled, listAttachments]);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Anexos</DialogTitle>
          <DialogDescription>
            {unavailable === "disabled"
              ? "Anexos indisponíveis neste ambiente"
              : unavailable === "offline"
                ? "Os anexos precisam de sinal. Tente de novo quando conectar."
              : list === null
                ? "Carregando…"
                : `${fileCountLabel(list.length)} · toque para abrir`}
          </DialogDescription>
        </DialogHeader>
        {list !== null && list.length === 0 ? (
          <p className="text-sm text-ink-soft">Nenhum anexo neste lançamento.</p>
        ) : null}
        {list !== null && list.length > 0 ? (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {list.map((attachment) => (
              <SavedAttachmentTile key={attachment.id} attachment={attachment} />
            ))}
          </ul>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
