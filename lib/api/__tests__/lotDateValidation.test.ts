import { Elysia } from "elysia";
import { describe, expect, it, vi } from "vitest";
import { ArchiveLotBody, MoveLotBody } from "@/lib/api/models";

const jsonRequest = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function lotDateApi() {
  const move = vi.fn(() => ({ ok: true }));
  const archive = vi.fn(() => ({ ok: true }));
  const app = new Elysia({ prefix: "/api/herd" })
    .post("/lots/:id/placements", move, { body: MoveLotBody })
    .post("/lots/:id/archive", archive, { body: ArchiveLotBody });

  return { app, move, archive };
}

describe("lot placement calendar-date validation", () => {
  it("rejects an impossible move date with 422 before the handler runs", async () => {
    const { app, move } = lotDateApi();
    const response = await app.handle(
      jsonRequest("/api/herd/lots/lot-1/placements", {
        invernadaId: "invernada-2",
        startedOn: "2026-02-31",
      })
    );

    expect(response.status).toBe(422);
    expect(move).not.toHaveBeenCalled();
  });

  it("rejects an impossible archive date with 422 before the handler runs", async () => {
    const { app, archive } = lotDateApi();
    const response = await app.handle(
      jsonRequest("/api/herd/lots/lot-1/archive", {
        endedOn: "2025-02-29",
      })
    );

    expect(response.status).toBe(422);
    expect(archive).not.toHaveBeenCalled();
  });

  it("accepts a real leap day", async () => {
    const { app, move } = lotDateApi();
    const response = await app.handle(
      jsonRequest("/api/herd/lots/lot-1/placements", {
        invernadaId: "invernada-2",
        startedOn: "2024-02-29",
      })
    );

    expect(response.status).toBe(200);
    expect(move).toHaveBeenCalledOnce();
  });
});
