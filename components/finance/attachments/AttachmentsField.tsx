"use client";

/**
 * "Anexos" in the EntryDialog: photos and PDFs of the NF or recibo. Editing a
 * lançamento, a file uploads the moment it is chosen and a removal is
 * immediate. On a new lançamento the files wait in `pending` and the dialog
 * uploads them once the lançamento exists, showing each one's progress.
 * Without a Blob store the block says so; offline (or when the check itself
 * failed) the buttons wait for signal.
 */
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, FolderOpen, Paperclip } from "lucide-react";
import type { Attachment } from "@/lib/types";
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  attachmentContentType,
  fileCountLabel,
  isAttachmentType,
} from "@/lib/domain/attachments";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { compressImage } from "@/components/finance/attachments/compressImage";
import { PendingFileTile, SavedAttachmentTile } from "@/components/finance/attachments/AttachmentTile";
import { Button } from "@/components/ui/button";

/** A chosen file not yet on the server. */
export interface PendingFile {
  key: string;
  file: File;
  contentType: string;
  /** 0–100 while uploading, null before. */
  progress: number | null;
  error: string | null;
}

interface AttachmentsFieldProps {
  /** The lançamento being edited; absent on a new one. */
  expenseId?: string;
  pending: PendingFile[];
  onPendingChange(update: (files: PendingFile[]) => PendingFile[]): void;
  /** True while the dialog saves (and uploads the pending files). */
  busy?: boolean;
}

export function AttachmentsField({ expenseId, pending, onPendingChange, busy = false }: AttachmentsFieldProps) {
  const attachmentsEnabled = useHerdStore((s) => s.attachmentsEnabled);
  const listAttachments = useHerdStore((s) => s.listAttachments);
  const uploadAttachment = useHerdStore((s) => s.uploadAttachment);
  const removeAttachment = useHerdStore((s) => s.removeAttachment);
  const offline = useHerdStore((s) => s.offline);
  /** undefined while checking; null when the check failed (no signal). */
  const [enabled, setEnabled] = useState<boolean | null | undefined>(undefined);
  const [saved, setSaved] = useState<Attachment[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    attachmentsEnabled()
      .then(async (on) => {
        if (cancelled) return;
        setEnabled(on);
        if (on && expenseId) {
          const found = await listAttachments(expenseId);
          if (!cancelled) setSaved(found);
        }
      })
      .catch(() => {}); // listAttachments' apiFail already told the user
    return () => {
      cancelled = true;
    };
  }, [attachmentsEnabled, listAttachments, expenseId]);

  const total = saved.length + pending.length;
  const canAdd = enabled === true && !offline && !busy && total < MAX_ATTACHMENTS;

  const patchPending = (key: string, patch: Partial<PendingFile>) =>
    onPendingChange((files) => files.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  async function upload(item: PendingFile, id: string) {
    try {
      const attachment = await uploadAttachment(id, item.file, (progress) =>
        patchPending(item.key, { progress })
      );
      onPendingChange((files) => files.filter((f) => f.key !== item.key));
      setSaved((list) => [...list, attachment]);
    } catch {
      patchPending(item.key, { progress: null, error: "não enviado" });
    }
  }

  async function onChoose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = "";
    const errors: string[] = [];
    const room = MAX_ATTACHMENTS - total;
    if (chosen.length > room) errors.push(`No máximo ${MAX_ATTACHMENTS} anexos por lançamento.`);
    const accepted: PendingFile[] = [];
    for (const original of chosen.slice(0, Math.max(0, room))) {
      const contentType = attachmentContentType(original.name, original.type);
      if (!isAttachmentType(contentType)) {
        errors.push(`${original.name}: só fotos (JPEG, PNG, WebP, HEIC) e PDF.`);
        continue;
      }
      const file = await compressImage(original);
      if (file.size > MAX_ATTACHMENT_BYTES) {
        errors.push(`${original.name} passa de 5 MB.`);
        continue;
      }
      accepted.push({
        key: crypto.randomUUID(),
        file,
        contentType: attachmentContentType(file.name, file.type),
        progress: expenseId ? 0 : null,
        error: null,
      });
    }
    setError(errors.length > 0 ? errors.join(" ") : null);
    onPendingChange((files) => [...files, ...accepted]);
    if (expenseId) for (const item of accepted) await upload(item, expenseId);
  }

  async function onRemoveSaved(attachment: Attachment) {
    setRemoving(attachment.id);
    try {
      await removeAttachment(attachment);
      setSaved((list) => list.filter((a) => a.id !== attachment.id));
    } catch {
      // apiFail already told the user.
    } finally {
      setRemoving(null);
    }
  }

  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="float-left w-full">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-xs leading-4 font-medium text-ink-soft">Anexos</span>
          {enabled === false ? null : (
            <span className="text-[11px] text-ink-soft">{total > 0 ? fileCountLabel(total) : "foto ou PDF, até 5 MB"}</span>
          )}
        </span>
      </legend>
      {enabled === false ? (
        <p className="text-sm text-ink-soft">Anexos indisponíveis neste ambiente</p>
      ) : (
        <>
          {total > 0 ? (
            <ul className="grid grid-cols-4 gap-2.5 lg:grid-cols-5">
              {saved.map((attachment) => (
                <SavedAttachmentTile
                  key={attachment.id}
                  attachment={attachment}
                  removing={removing === attachment.id}
                  onRemove={busy ? undefined : () => void onRemoveSaved(attachment)}
                />
              ))}
              {pending.map((item) => (
                <PendingFileTile
                  key={item.key}
                  file={item.file}
                  contentType={item.contentType}
                  progress={item.progress}
                  error={item.error}
                  onRemove={
                    busy || item.progress !== null
                      ? undefined
                      : () => onPendingChange((files) => files.filter((f) => f.key !== item.key))
                  }
                />
              ))}
            </ul>
          ) : null}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 md:hidden"
              disabled={!canAdd}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera aria-hidden />
              Tirar foto
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 md:hidden"
              disabled={!canAdd}
              onClick={() => fileRef.current?.click()}
            >
              <FolderOpen aria-hidden />
              Escolher arquivo
            </Button>
            <Button
              type="button"
              variant="outline"
              className="hidden w-full border-dashed text-brand md:inline-flex"
              disabled={!canAdd}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip aria-hidden />
              Adicionar foto ou PDF
            </Button>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => void onChoose(e)}
          />
          <input ref={fileRef} type="file" accept={ATTACHMENT_ACCEPT} multiple hidden onChange={(e) => void onChoose(e)} />
          {offline || enabled === null ? <p className="text-xs text-ink-soft">precisa de sinal</p> : null}
          {error ? (
            <p role="alert" className="text-xs text-overdue">
              {error}
            </p>
          ) : null}
        </>
      )}
    </fieldset>
  );
}
