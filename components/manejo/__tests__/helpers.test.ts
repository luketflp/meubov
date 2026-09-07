import { describe, expect, it } from "vitest";
import { manejoHistory } from "@/components/manejo/helpers";
import type { Animal, ManejoSession, Treatment } from "@/lib/types";

function makeSession(overrides: Partial<ManejoSession> = {}): ManejoSession {
  return {
    id: "sess-1",
    name: "Venda ao frigorífico",
    date: "2026-08-04",
    status: "closed",
    kind: "sale",
    weighing: true,
    animals: [{ earTag: "BR-001", outcome: "done", weightKg: 480, amountBrl: 4800 }],
    pricePerArroba: 300,
    ...overrides,
  };
}

const noAnimals: Animal[] = [];
const noTreatments: Treatment[] = [];

describe("manejoHistory row links", () => {
  it("links a closed venda to its sale screen", () => {
    const [row] = manejoHistory(noTreatments, noAnimals, [makeSession()]);
    expect(row.href).toBe("/manejo/venda/sess-1");
  });

  it("does not link a venda still running at the chute", () => {
    const [row] = manejoHistory(noTreatments, noAnimals, [makeSession({ status: "open" })]);
    expect(row.href).toBeUndefined();
  });

  it("does not link the other movements", () => {
    const sessions = [
      makeSession({ id: "sess-transfer", kind: "transfer", name: "Troca de lote" }),
      makeSession({ id: "sess-entry", kind: "entry", name: "Compra" }),
    ];
    const rows = manejoHistory(noTreatments, noAnimals, sessions);
    expect(rows.map((r) => r.href)).toEqual([undefined, undefined]);
  });

  it("does not link a batch of treatments", () => {
    const treatment: Treatment = {
      id: "t-1",
      animalEarTag: "BR-001",
      type: "vaccine",
      name: "Vacina aftosa",
      date: "2026-08-04",
      status: "done",
      withdrawalDays: 0,
    };
    const [row] = manejoHistory([treatment], noAnimals, []);
    expect(row.href).toBeUndefined();
  });
});
