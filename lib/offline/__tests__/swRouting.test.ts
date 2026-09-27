import { describe, expect, it } from "vitest";
import { route, type SwRoute } from "@/lib/offline/swRouting";

const BASE = "https://meubov.test";

type Row = [
  label: string,
  path: string,
  mode: RequestMode,
  method: string,
  headers: Record<string, string>,
  expected: SwRoute,
];

const bypass: SwRoute = { strategy: "bypass", cacheKey: null, templateKey: null };
const page = (cacheKey: string, templateKey: string | null = null): SwRoute => ({
  strategy: "navigate-network-first",
  cacheKey,
  templateKey,
});
const rsc = (cacheKey: string, templateKey: string | null = null): SwRoute => ({
  strategy: "rsc-network-first",
  cacheKey,
  templateKey,
});

const rows: Row[] = [
  ["a hashed chunk", "/_next/static/chunks/app-1a2b.js", "no-cors", "GET", {}, { strategy: "static-cache-first", cacheKey: null, templateKey: null }],
  ["a self-hosted font", "/_next/static/media/plex.woff2", "cors", "GET", {}, { strategy: "static-cache-first", cacheKey: null, templateKey: null }],
  ["the herd API", "/api/herd", "cors", "GET", {}, bypass],
  ["a pass", "/api/herd/manejo/abc/animals/1/complete", "cors", "POST", {}, bypass],
  ["auth", "/api/auth/get-session", "cors", "GET", {}, bypass],
  ["an optimized image", "/_next/image?url=%2Ffarms%2Fa.jpg&w=640&q=75", "no-cors", "GET", {}, bypass],
  ["a form post navigation", "/manejo/abc", "navigate", "POST", {}, bypass],
  ["the Painel", "/dashboard", "navigate", "GET", {}, page("/dashboard")],
  ["the Manejo list", "/manejo", "navigate", "GET", {}, page("/manejo")],
  ["a runner", "/manejo/7f3c2a90-1b2c-4d5e-8f90-123456789abc", "navigate", "GET", {}, page("/manejo/7f3c2a90-1b2c-4d5e-8f90-123456789abc", "doc:/manejo/[id]")],
  ["a runner with a query", "/manejo/abc?aba=pendentes", "navigate", "GET", {}, page("/manejo/abc", "doc:/manejo/[id]")],
  ["the avulso folder", "/manejo/avulso", "navigate", "GET", {}, page("/manejo/avulso")],
  ["a pesagem avulsa", "/manejo/avulso/pesagem/2026-09-01", "navigate", "GET", {}, page("/manejo/avulso/pesagem/2026-09-01")],
  ["a tratamento avulso", "/manejo/avulso/tratamento/abc", "navigate", "GET", {}, page("/manejo/avulso/tratamento/abc")],
  ["the old venda address", "/manejo/venda/abc", "navigate", "GET", {}, page("/manejo/venda/abc")],
  ["the offline page", "/offline", "navigate", "GET", {}, page("/offline")],
  ["a runner's RSC by header", "/manejo/abc", "cors", "GET", { rsc: "1" }, rsc("rsc:/manejo/abc", "rsc:/manejo/[id]")],
  ["a runner's RSC by query", "/manejo/abc?_rsc=1x2y3", "cors", "GET", {}, rsc("rsc:/manejo/abc", "rsc:/manejo/[id]")],
  ["the list's RSC", "/manejo?_rsc=9z", "cors", "GET", { rsc: "1" }, rsc("rsc:/manejo")],
  ["a prefetch", "/manejo/abc?_rsc=1x2y3", "cors", "GET", { rsc: "1", "next-router-prefetch": "1" }, bypass],
  ["a segment prefetch", "/manejo/abc?_rsc=1x2y3", "cors", "GET", { rsc: "1", "next-router-segment-prefetch": "/_tree" }, bypass],
  ["a public illustration", "/illustrations/sem-sinal.svg", "no-cors", "GET", {}, bypass],
  ["the manifest", "/manifest.webmanifest", "cors", "GET", {}, bypass],
];

describe("route", () => {
  it.each(rows)("%s", (_label, path, mode, method, headers, expected) => {
    expect(route(new URL(path, BASE), mode, method, new Headers(headers))).toEqual(expected);
  });

  it("reads no headers when none are given", () => {
    expect(route(new URL("/manejo/abc?_rsc=1", BASE), "cors", "GET")).toEqual(
      rsc("rsc:/manejo/abc", "rsc:/manejo/[id]")
    );
  });
});
