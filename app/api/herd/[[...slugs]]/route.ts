/**
 * Mounts the Elysia herd API under /api/herd.
 *
 * Next 16 route handlers receive a Web-standard Request, which is exactly what
 * Elysia's handle() consumes — no adapter needed. The optional catch-all
 * ([[...slugs]]) also matches /api/herd itself. Elysia AOT-compiles handlers
 * with `new Function`, so this route must stay on the Node runtime.
 */
import { herdApi } from "@/lib/api/app";

const handle = (request: Request) => herdApi.handle(request);

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
