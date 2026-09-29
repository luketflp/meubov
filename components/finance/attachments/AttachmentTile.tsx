"use client";

/**
 * One anexo as a tile: the photo itself or a PDF icon, its name and size, a
 * remove button in the corner and, while it uploads, a progress bar. A saved
 * anexo is fetched through GET /api/herd/attachments/:id (with the farm
 * header) into an object URL, which the tile shows and opens.
 */
import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import type { Attachment } from "@/lib/types";
import { getActiveFarmId } from "@/lib/api/activeFarm";
import { formatBytes } from "@/lib/domain/attachments";
import { cn } from "@/lib/utils";

/** Object URL of a saved anexo's bytes (null until fetched), and whether the fetch failed. */
export function useAttachmentUrl(id: string | null): { url: string | null; failed: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    const farmId = getActiveFarmId();
    fetch(`/api/herd/attachments/${id}`, {
      headers: farmId === null ? undefined : { "x-farm-id": String(farmId) },
    })
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (cancelled) return;
        if (!blob) return setFailed(true);
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  return { url, failed };
}

/** A data URL of a local photo for its preview; null for a PDF. */
function useImagePreview(file: File): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setUrl(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);
  return url;
}

interface TileProps {
  name: string;
  sizeBytes: number;
  contentType: string;
  url: string | null;
  /** Saved anexos open in a new tab; a file still on the phone does not. */
  openable?: boolean;
  /** 0–100 while uploading. */
  progress?: number | null;
  error?: string | null;
  onRemove?: () => void;
  removing?: boolean;
}

function Tile({ name, sizeBytes, contentType, url, openable, progress, error, onRemove, removing }: TileProps) {
  const image = contentType.startsWith("image/") && contentType !== "image/heic";
  const preview = (
    <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-hairline bg-surface">
      {image && url ? (
        // An object URL of the anexo's bytes: next/image cannot optimise it.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <span className="flex flex-col items-center gap-1 text-ink-soft">
          <FileText className="size-6" aria-hidden />
          <span className="text-[11px] font-medium">{contentType === "application/pdf" ? "PDF" : "Foto"}</span>
        </span>
      )}
    </span>
  );
  return (
    <li className="relative flex min-w-0 flex-col gap-1">
      {openable && url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" title={`Abrir ${name}`} aria-label={`Abrir ${name}`}>
          {preview}
        </a>
      ) : (
        preview
      )}
      {progress != null ? (
        <span className="absolute inset-x-1 top-[calc(100%-3.25rem)] h-1 overflow-hidden rounded-full bg-hairline">
          <span className="block h-full bg-brand transition-[width]" style={{ width: `${progress}%` }} />
        </span>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          aria-label={`Remover ${name}`}
          className="absolute -top-2 -right-2 flex size-11 items-center justify-center md:size-7"
        >
          <span className="flex size-6 items-center justify-center rounded-full border border-hairline bg-panel text-ink-soft shadow-sm hover:text-overdue">
            <X className="size-3.5" aria-hidden />
          </span>
        </button>
      ) : null}
      <span className="truncate text-xs text-ink">{name}</span>
      <span className={cn("font-mono text-[11px]", error ? "text-overdue" : "text-ink-soft")}>
        {error ?? (progress != null ? `${Math.round(progress)}%` : formatBytes(sizeBytes))}
      </span>
    </li>
  );
}

export function SavedAttachmentTile({
  attachment,
  onRemove,
  removing,
}: {
  attachment: Attachment;
  onRemove?: () => void;
  removing?: boolean;
}) {
  const { url, failed } = useAttachmentUrl(attachment.id);
  return (
    <Tile
      name={attachment.fileName}
      sizeBytes={attachment.sizeBytes}
      contentType={attachment.contentType}
      url={url}
      error={failed ? "não carregou" : null}
      openable
      onRemove={onRemove}
      removing={removing}
    />
  );
}

export function PendingFileTile({
  file,
  contentType,
  progress,
  error,
  onRemove,
}: {
  file: File;
  contentType: string;
  progress?: number | null;
  error?: string | null;
  onRemove?: () => void;
}) {
  const url = useImagePreview(file);
  return (
    <Tile
      name={file.name}
      sizeBytes={file.size}
      contentType={contentType}
      url={url}
      progress={progress}
      error={error}
      onRemove={onRemove}
    />
  );
}
