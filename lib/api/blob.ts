/**
 * The anexos' file store, behind one small interface so the use cases can be
 * tested with the in-memory fake (`lib/api/__tests__/memoryBlob.ts`).
 *
 * Production is a PRIVATE Vercel Blob store: no file is reachable by URL, the
 * browser uploads straight to Blob with a short-lived client token our API
 * signs (the file never crosses our function's 4.5 MB body limit), and every
 * read goes through GET /api/herd/attachments/:id, which streams the blob
 * with the server's read-write token after checking the farm.
 */
import { BlobNotFoundError, del, get, head } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";

export interface BlobFile {
  size: number;
  contentType: string;
}

export interface BlobStore {
  /** False without BLOB_READ_WRITE_TOKEN: the dialog says "Anexos indisponíveis neste ambiente". */
  enabled(): boolean;
  /** A client token that lets the browser upload exactly `pathname`, within the limits. */
  clientToken(
    pathname: string,
    limits: { maximumSizeInBytes: number; allowedContentTypes: readonly string[] }
  ): Promise<string>;
  /** Size and type of a stored file; null when there is none. */
  head(pathname: string): Promise<BlobFile | null>;
  /** The file's bytes; null when there is none. */
  stream(pathname: string): Promise<ReadableStream<Uint8Array> | null>;
  del(pathnames: string[]): Promise<void>;
}

/** How long a client token stays valid: enough for 5 MB over a weak rural signal. */
const TOKEN_TTL_MS = 15 * 60 * 1000;

export const vercelBlobStore: BlobStore = {
  enabled: () => Boolean(process.env.BLOB_READ_WRITE_TOKEN),

  clientToken: (pathname, limits) =>
    generateClientTokenFromReadWriteToken({
      pathname,
      maximumSizeInBytes: limits.maximumSizeInBytes,
      allowedContentTypes: [...limits.allowedContentTypes],
      addRandomSuffix: false,
      allowOverwrite: false,
      validUntil: Date.now() + TOKEN_TTL_MS,
    }),

  async head(pathname) {
    try {
      const blob = await head(pathname);
      return { size: blob.size, contentType: blob.contentType };
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  },

  async stream(pathname) {
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    return result.stream;
  },

  del: async (pathnames) => {
    if (pathnames.length > 0) await del(pathnames);
  },
};

/** Removes files after their rows are gone; a failure is logged, never blocks the removal. */
export async function deleteBlobsQuietly(store: BlobStore, pathnames: string[]): Promise<void> {
  try {
    await store.del(pathnames);
  } catch (error) {
    console.error("[anexos] could not delete blobs", pathnames, error);
  }
}
