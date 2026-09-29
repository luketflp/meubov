/**
 * Anexos: what may be attached to a lançamento and where the file lives.
 * Pure; shared by the API (checks) and the dialog (compression, labels).
 */

/** Largest file after the phone reduced it. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
/** Anexos per lançamento. */
export const MAX_ATTACHMENTS = 10;
export const ATTACHMENT_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
];
/** `accept` of the file inputs; ".heic" because some browsers give HEIC no type. */
export const ATTACHMENT_ACCEPT = [...ATTACHMENT_TYPES, ".heic"].join(",");
/** A photo is reduced to this longest side, JPEG at this quality. */
export const COMPRESS_MAX_SIDE = 1600;
export const COMPRESS_QUALITY = 0.8;

export function isAttachmentType(contentType: string): boolean {
  return ATTACHMENT_TYPES.includes(contentType);
}

/** The file's type, "image/heic" for a .heic the browser left untyped. */
export function attachmentContentType(fileName: string, type: string): string {
  if (type === "" && /\.heic$/i.test(fileName)) return "image/heic";
  return type;
}

/** Every anexo of a lançamento lives under this folder of the store. */
export function attachmentPrefix(farmId: number, expenseId: string): string {
  return `farms/${farmId}/expenses/${expenseId}/`;
}

/** `farms/<farmId>/expenses/<expenseId>/<id>-<name>`, the name reduced to safe characters. */
export function attachmentPathname(
  farmId: number,
  expenseId: string,
  id: string,
  fileName: string
): string {
  const safe =
    fileName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(-80) || "anexo";
  return `${attachmentPrefix(farmId, expenseId)}${id}-${safe}`;
}

/**
 * The farm and lançamento a pathname claims; null when it is not exactly what
 * `attachmentPathname` builds (a UUID anexo id, then the safe name). The
 * lançamento id is a UUID in production; the dev seed uses "expense-N".
 */
export function parseAttachmentPathname(
  pathname: string
): { farmId: number; expenseId: string } | null {
  const match =
    /^farms\/(\d+)\/expenses\/([A-Za-z0-9-]{1,64})\/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,80}$/.exec(pathname);
  return match ? { farmId: Number(match[1]), expenseId: match[2] } : null;
}

/** Scales width × height down so the longest side is at most `max`. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** "480 KB", "1,2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** "1 arquivo", "2 arquivos". */
export function fileCountLabel(count: number): string {
  return count === 1 ? "1 arquivo" : `${count} arquivos`;
}
