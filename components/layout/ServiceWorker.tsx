"use client";

/**
 * Registers the offline shell (public/sw.js) once the app has loaded, then
 * hands the worker what this page loaded before the worker could see it (its
 * chunks and its own document), so the shell opens without signal from the
 * first visit on.
 *
 * Only a production build registers it: `next dev` serves chunks under URLs
 * that keep their name while their code changes, and a cache-first worker
 * would keep running old code. In dev, a worker left on the same origin by a
 * production run is removed instead.
 */
import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const container = navigator.serviceWorker;
    if (process.env.NODE_ENV !== "production") {
      void container
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => {});
      return;
    }
    // A page the worker already controls had its document kept on the way in.
    const firstLoad = container.controller === null;
    container
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => container.ready)
      .then((registration) => {
        const urls = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => new URL(url).pathname.startsWith("/_next/static/"));
        registration.active?.postMessage({ type: "warm", urls, page: firstLoad ? window.location.pathname : undefined });
      })
      .catch(() => {
        // No worker (private window, storage blocked): the app works online as before.
      });
  }, []);

  return null;
}
