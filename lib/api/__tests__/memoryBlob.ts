/**
 * In-memory BlobStore for use-case tests: `files` is what the store holds,
 * `deleted` every pathname passed to `del`, `tokens` every pathname a client
 * token was signed for.
 */
import type { BlobFile, BlobStore } from "@/lib/api/blob";

export function memoryBlobStore(initial: Record<string, BlobFile> = {}, enabled = true) {
  const files = new Map(Object.entries(initial));
  const deleted: string[] = [];
  const tokens: string[] = [];
  const store: BlobStore = {
    enabled: () => enabled,
    clientToken: async (pathname) => {
      tokens.push(pathname);
      return `token:${pathname}`;
    },
    head: async (pathname) => files.get(pathname) ?? null,
    stream: async (pathname) => {
      return files.has(pathname) ? new Blob(["bytes"]).stream() : null;
    },
    del: async (pathnames) => {
      for (const pathname of pathnames) {
        deleted.push(pathname);
        files.delete(pathname);
      }
    },
  };
  return { store, files, deleted, tokens };
}
