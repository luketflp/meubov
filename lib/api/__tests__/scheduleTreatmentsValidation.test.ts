import { Elysia } from "elysia";
import { describe, expect, it, vi } from "vitest";
import { ScheduleTreatmentsBody } from "@/lib/api/domains/treatments/schemas/treatment.schema";

const jsonRequest = (body: unknown) =>
  new Request("http://localhost/api/herd/treatments/schedule", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function validationApi() {
  const schedule = vi.fn(() => ({ treatments: [] }));
  const app = new Elysia({ prefix: "/api/herd" }).post(
    "/treatments/schedule",
    schedule,
    { body: ScheduleTreatmentsBody }
  );
  return { app, schedule };
}

describe("scheduled treatment validation", () => {
  it("accepts a protocol-based schedule", async () => {
    const { app, schedule } = validationApi();
    const response = await app.handle(
      jsonRequest({
        date: "2026-09-18",
        animalIds: ["animal-1", "animal-2"],
        source: { kind: "protocol", protocolId: "protocol-1" },
      })
    );

    expect(response.status).toBe(200);
    expect(schedule).toHaveBeenCalledOnce();
  });

  it("accepts a valid one-off treatment", async () => {
    const { app, schedule } = validationApi();
    const response = await app.handle(
      jsonRequest({
        date: "2026-09-18",
        animalIds: ["animal-1"],
        source: {
          kind: "standalone",
          name: "Reforço clostridial",
          type: "vaccine",
          withdrawalDays: 0,
        },
      })
    );

    expect(response.status).toBe(200);
    expect(schedule).toHaveBeenCalledOnce();
  });

  it.each([
    {
      date: "2026-02-30",
      animalIds: ["animal-1"],
      source: { kind: "protocol", protocolId: "protocol-1" },
    },
    {
      date: "2026-09-18",
      animalIds: [],
      source: { kind: "protocol", protocolId: "protocol-1" },
    },
    {
      date: "2026-09-18",
      animalIds: ["animal-1"],
      source: {
        kind: "standalone",
        name: "   ",
        type: "vaccine",
        withdrawalDays: 0,
      },
    },
  ])("rejects an invalid scheduling payload", async (body) => {
    const { app, schedule } = validationApi();
    const response = await app.handle(jsonRequest(body));

    expect(response.status).toBe(422);
    expect(schedule).not.toHaveBeenCalled();
  });
});
