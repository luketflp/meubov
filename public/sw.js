/*
 * MeuBov offline shell: a plain service worker served as is from /public (no
 * build step, no imports). Registered by components/layout/ServiceWorker.tsx.
 *
 * route() below is an inline copy of lib/offline/swRouting.ts, its tested
 * twin. Change both together.
 *
 * - /_next/static/*: cache-first. The file names carry a content hash.
 * - Page documents and RSC fetches: network first; after 3 s a kept copy is
 *   served if there is one, else the worker waits for the network. A good
 *   answer is kept under its path and, for a /manejo/<id> page, also as the
 *   runner "template", which serves any session because the runner reads its
 *   id from the URL. Without signal: the same path, then the template, then
 *   /offline (documents) or a 503 (RSC; Next then retries as a document
 *   navigation, which lands on the document fallback).
 * - /api/*, /_next/image, prefetches, non-GET and every other file: not
 *   touched and never cached.
 */
const VERSION = "v1";
const SHELL_CACHE = `meubov-shell-${VERSION}`;
// ponytail: static grows by one set of chunks per deploy until VERSION changes; prune by age if phones fill up.
const STATIC_CACHE = `meubov-static-${VERSION}`;
const OFFLINE_PAGE = "/offline";
const NETWORK_TIMEOUT_MS = 3000;

const BYPASS = { strategy: "bypass", cacheKey: null, templateKey: null };

/** A session's runner page: /manejo/<id>, not the list, not /manejo/avulso/…. */
const RUNNER_PATH = /^\/manejo\/(?!avulso$)[^/]+$/;

function route(url, mode, method, headers) {
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

/** Cache keys are names ("/manejo", "doc:/manejo/[id]"); the Cache API wants a same-origin URL. */
function keyUrl(key) {
  return new URL(`/__sw/${encodeURIComponent(key)}`, self.location.origin).href;
}

async function remember(cache, r, response) {
  const copy = r.templateKey ? response.clone() : null;
  await cache.put(keyUrl(r.cacheKey), response);
  if (copy) await cache.put(keyUrl(r.templateKey), copy);
}

/** The first of these keys the shell cache holds; undefined when none, or when storage is blocked. */
async function recall(...keys) {
  try {
    const cache = await caches.open(SHELL_CACHE);
    for (const key of keys) {
      const hit = key ? await cache.match(keyUrl(key), { ignoreVary: true }) : undefined;
      if (hit) return hit;
    }
  } catch {
    // Storage blocked: behave as a miss.
  }
  return undefined;
}

function isOwnStatic(value) {
  if (typeof value !== "string") return false;
  const url = new URL(value, self.location.origin);
  return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
}

async function warmStatic(urls) {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(
    urls.map(async (url) => {
      try {
        if (!(await cache.match(url))) await cache.add(url);
      } catch {
        // Best effort: the file is cached the next time a page asks for it.
      }
    })
  );
}

/** Keeps the document of a page the user reached by a link, so a reload without signal still opens it. */
async function warmDocument(path) {
  try {
    const url = new URL(path, self.location.origin);
    const r = route(url, "navigate", "GET", new Headers());
    if (r.strategy !== "navigate-network-first") return;
    const response = await fetch(url, { credentials: "same-origin" });
    if (response.ok && !response.redirected) await remember(await caches.open(SHELL_CACHE), r, response);
  } catch {
    // Best effort: the next visit tries again.
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone()).catch(() => {});
  return response;
}

/** Stores a good answer under its keys and, for a runner's RSC, warms the runner's document too. */
async function keep(r, response, path, isDocument) {
  try {
    await remember(await caches.open(SHELL_CACHE), r, response);
  } catch {
    // Storage blocked or full: the answer still reaches the page.
  }
  if (!isDocument && RUNNER_PATH.test(path)) await warmDocument(path);
}

const TIMEOUT = Symbol("timeout");

/**
 * The network is never aborted: after 3 s a kept copy is served if there is
 * one, otherwise the worker keeps waiting for a slow network. /offline (or the
 * 503) only when the fetch itself fails. A late answer still refreshes the cache.
 */
async function networkFirst(event, r, isDocument) {
  let stored = Promise.resolve();
  const net = fetch(event.request).then(
    (response) => {
      if (response.ok && response.type === "basic" && !response.redirected) {
        stored = keep(r, response.clone(), new URL(event.request.url).pathname, isDocument);
      }
      return response;
    },
    () => null
  );
  // Called before any await, while the event is still dispatching; keeps the
  // worker alive until a late answer is stored, even after a cached one was served.
  event.waitUntil(net.then(() => stored));

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), NETWORK_TIMEOUT_MS);
  });
  const first = await Promise.race([net, timeout]);
  clearTimeout(timer);
  if (first && first !== TIMEOUT) return first;

  const hit = await recall(r.cacheKey, r.templateKey);
  if (hit) return hit;
  const late = first === TIMEOUT ? await net : null;
  if (late) return late;
  const offline = isDocument ? await recall(OFFLINE_PAGE) : undefined;
  return offline ?? new Response(null, { status: 503, statusText: "Offline" });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch(OFFLINE_PAGE, { credentials: "same-origin" });
      if (!response.ok || response.redirected) throw new Error(`${OFFLINE_PAGE} answered ${response.status}`);
      const html = await response.clone().text();
      await (await caches.open(SHELL_CACHE)).put(keyUrl(OFFLINE_PAGE), response);
      // Its stylesheet and scripts, so the page draws without signal.
      await warmStatic([...new Set(html.match(/\/_next\/static\/[^"'\s\\)&]+/g) ?? [])]);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [SHELL_CACHE, STATIC_CACHE];
      for (const name of await caches.keys()) {
        if (name.startsWith("meubov-") && !keep.includes(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })()
  );
});

// The page that registered the worker loaded before the worker could see it:
// it sends its chunk URLs and its path here so they are kept too.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "warm") return;
  const jobs = [warmStatic((Array.isArray(data.urls) ? data.urls : []).filter(isOwnStatic))];
  if (typeof data.page === "string" && data.page.startsWith("/")) jobs.push(warmDocument(data.page));
  event.waitUntil(Promise.all(jobs));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const r = route(url, request.mode, request.method, request.headers);
  if (r.strategy === "static-cache-first") event.respondWith(cacheFirst(request));
  else if (r.strategy === "navigate-network-first") event.respondWith(networkFirst(event, r, true));
  else if (r.strategy === "rsc-network-first") event.respondWith(networkFirst(event, r, false));
});
