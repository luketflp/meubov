/** Hands a Blob to the browser as a download named `fileName`. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Defer the revoke so the browser has started the download before the blob
  // URL is released.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
