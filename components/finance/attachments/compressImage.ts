/**
 * A photo from the phone is reduced before it leaves: longest side 1600 px,
 * JPEG at 0.8 — a 4 MB camera shot becomes a few hundred KB. A photo already
 * small enough, a PDF, or a format the browser cannot decode (HEIC outside
 * Safari) goes as it is; the 5 MB limit still applies after this.
 */
import {
  COMPRESS_MAX_SIDE,
  COMPRESS_QUALITY,
  MAX_ATTACHMENT_BYTES,
  fitWithin,
} from "@/lib/domain/attachments";

const DECODABLE = ["image/jpeg", "image/png", "image/webp"];

export async function compressImage(file: File): Promise<File> {
  if (!DECODABLE.includes(file.type)) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, COMPRESS_MAX_SIDE);
  if (width === bitmap.width && height === bitmap.height && file.size <= MAX_ATTACHMENT_BYTES) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context) {
    // JPEG has no alpha: a transparent PNG would otherwise turn black.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
  }
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", COMPRESS_QUALITY)
  );
  if (!blob) return file;
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
}
