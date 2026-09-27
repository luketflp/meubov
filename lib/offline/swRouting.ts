/**
 * The offline shell's routing, as a pure function: which strategy the service
 * worker uses for a request and under which cache keys it keeps the answer.
 *
 * public/sw.js carries an inline copy of this logic (a worker served from
 * /public cannot import app modules); this file is its tested twin. Change
 * both together. Nothing imports it at runtime.
 */
export type SwStrategy = "static-cache-first" | "navigate-network-first" | "rsc-network-first" | "bypass";

export interface SwRoute {
  strategy: SwStrategy;
  /** Where a good answer is kept: the page's path (documents) or `rsc:<path>`. */
  cacheKey: string | null;
  /** The runner template this answer also refreshes, for a /manejo/<id> page. */
  templateKey: string | null;
}

/** The part of `Headers` the routing reads. */
export interface HeaderReader {
  get(name: string): string | null;
}

const BYPASS: SwRoute = { strategy: "bypass", cacheKey: null, templateKey: null };

/** A session's runner page: /manejo/<id> — not the list, not /manejo/avulso/…. */
const RUNNER_PATH = /^\/manejo\/(?!avulso$)[^/]+$/;

export function route(
  url: URL,
  mode: RequestMode | "navigate",
  method: string,
  headers?: HeaderReader
): SwRoute {
  const path = url.pathname;
  if (method !== "GET") return BYPASS;
  if (path.startsWith("/_next/static/")) {
    return { strategy: "static-cache-first", cacheKey: null, templateKey: null };
  }
  if (path.startsWith("/api/") || path.startsWith("/_next/")) return BYPASS;

  const runner = RUNNER_PATH.test(path);
  if (mode === "navigate") {
    return {
      strategy: "navigate-network-first",
      cacheKey: path,
      templateKey: runner ? "doc:/manejo/[id]" : null,
    };
  }

  const rsc = headers?.get("rsc") === "1" || url.searchParams.has("_rsc");
  // A prefetch is a partial payload: keeping it would answer a navigation with half a page.
  const prefetch =
    headers?.get("next-router-prefetch") != null || headers?.get("next-router-segment-prefetch") != null;
  if (rsc && !prefetch) {
    return {
      strategy: "rsc-network-first",
      cacheKey: `rsc:${path}`,
      templateKey: runner ? "rsc:/manejo/[id]" : null,
    };
  }
  return BYPASS;
}
