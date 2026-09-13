import { describe, expect, it } from "vitest";
import { manejoHistory, visibleSaleRows } from "@/components/manejo/helpers";
import type { SaleRow } from "@/lib/domain/movements";
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

describe("manejoHistory", () => {
  const steer = (earTag: string, weighings: Animal["weighings"]): Animal => ({
    id: `id-${earTag}`,
    earTag,
    category: "steer",
    breed: "Nelore",
    sex: "male",
    birthDate: "2024-01-10",
    lotId: "lot-1",
    active: true,
    weighings,
  });
  const treatment = (overrides: Partial<Treatment>): Treatment => ({
    id: "t-1",
    animalEarTag: "BR-001",
    type: "vaccine",
    name: "Aftosa",
    date: "2026-08-04",
    status: "done",
    withdrawalDays: 0,
    ...overrides,
  });

  it("lists every session with an animal done and links it to its page", () => {
    const sessions = [
      makeSession(),
      makeSession({ id: "sess-open", status: "open", kind: "transfer", name: "Troca" }),
      makeSession({ id: "sess-entry", kind: "entry", name: "Compra" }),
      makeSession({
        id: "sess-empty",
        kind: "weighing",
        name: "Nada passou",
        animals: [{ earTag: "BR-009", outcome: "skipped" }],
      }),
    ];
    const rows = manejoHistory(noTreatments, noAnimals, sessions);
    expect(rows.map((row) => [row.name, row.href])).toEqual([
      ["Compra", "/manejo/sess-entry"],
      ["Troca", "/manejo/sess-open"],
      ["Venda ao frigorífico", "/manejo/sess-1"],
    ]);
  });

  it("reads a sanitary session as its treatment, with the plan's responsável and cost", () => {
    const session = makeSession({
      id: "sess-vac",
      kind: "health",
      name: "Aftosa maio",
      pricePerArroba: undefined,
      treatment: { type: "vaccine", name: "Aftosa", withdrawalDays: 30, responsible: "Dr. Paulo", costBrl: 3.2 },
      animals: [
        { earTag: "BR-001", outcome: "done", treatmentId: "t-1" },
        { earTag: "BR-002", outcome: "done", treatmentId: "t-2" },
        { earTag: "BR-003", outcome: "skipped" },
      ],
    });
    const treatments = [
      treatment({ id: "t-1", costBrl: 3.2 }),
      treatment({ id: "t-2", animalEarTag: "BR-002", costBrl: 3.2 }),
    ];
    const rows = manejoHistory(treatments, noAnimals, [session]);
    expect(rows).toEqual([
      {
        key: "sess-vac",
        date: "2026-08-04",
        kind: "vaccine",
        name: "Aftosa maio",
        headCount: 2,
        responsible: "Dr. Paulo",
        amountBrl: 6.4,
        href: "/manejo/sess-vac",
        sessionId: "sess-vac",
      },
    ]);
  });

  it("gives a pesagem session no value", () => {
    const session = makeSession({ kind: "weighing", name: "Pesagem boiada", pricePerArroba: undefined, animals: [{ earTag: "BR-001", outcome: "done", weightKg: 480 }] });
    const [row] = manejoHistory(noTreatments, noAnimals, [session]);
    expect(row).toMatchObject({ kind: "weighing", amountBrl: null, responsible: undefined });
  });

  it("groups the treatments marked feito outside a session", () => {
    const rows = manejoHistory(
      [
        treatment({ id: "t-cal-1", type: "deworming", name: "Ivermectina", costBrl: 2 }),
        treatment({ id: "t-cal-2", animalEarTag: "BR-002", type: "deworming", name: "Ivermectina", costBrl: 2 }),
        treatment({ id: "t-open", status: "scheduled" }),
      ],
      noAnimals,
      []
    );
    expect(rows).toEqual([
      {
        key: "2026-08-04|deworming|Ivermectina",
        date: "2026-08-04",
        kind: "deworming",
        name: "Ivermectina",
        subtitle: "Calendário sanitário",
        headCount: 2,
        responsible: undefined,
        amountBrl: 4,
        href: "/manejo/avulso/tratamento/t-cal-1",
        treatmentId: "t-cal-1",
      },
    ]);
  });

  it("groups the weighings saved outside a session by day", () => {
    const animals = [
      steer("BR-001", [
        { id: 1, date: "2026-08-04", weightKg: 480 },
        { id: 2, date: "2026-08-10", weightKg: 490 },
      ]),
      steer("BR-002", [{ id: 3, date: "2026-08-10", weightKg: 30 }]),
    ];
    const session = makeSession({
      kind: "weighing",
      name: "Pesagem boiada",
      pricePerArroba: undefined,
      animals: [{ earTag: "BR-001", outcome: "done", weightKg: 480, weighingId: 1 }],
    });
    const rows = manejoHistory(noTreatments, animals, [session]);
    expect(rows.map((row) => [row.name, row.subtitle, row.headCount, row.href, row.earTags])).toEqual([
      ["Pesagens avulsas", "fora do brete", 2, "/manejo/avulso/pesagem/2026-08-10", ["BR-001", "BR-002"]],
      ["Pesagem boiada", undefined, 1, "/manejo/sess-1", undefined],
    ]);
  });
});

describe("visibleSaleRows", () => {
  const sold: SaleRow = {
    earTag: "BR-001",
    outcome: "done",
    weightKg: 480,
    carcassArrobas: 16,
    amountBrl: 4800,
  };
  const skipped: SaleRow = {
    earTag: "BR-002",
    outcome: "skipped",
    weightKg: null,
    carcassArrobas: null,
    amountBrl: null,
    notes: "manca",
  };
  const pending: SaleRow = {
    earTag: "BR-003",
    outcome: "pending",
    weightKg: null,
    carcassArrobas: null,
    amountBrl: null,
  };
  const rows = [sold, skipped, pending];

  it("keeps only the animals that passed under the sold scope", () => {
    expect(visibleSaleRows(rows, "sold", "")).toEqual([sold]);
  });

  it("keeps every animal of the session under the lot scope", () => {
    expect(visibleSaleRows(rows, "lot", "")).toEqual(rows);
  });

  it("matches an ear tag regardless of case or surrounding spaces", () => {
    expect(visibleSaleRows(rows, "lot", "  br-002 ")).toEqual([skipped]);
  });

  it("matches on part of an ear tag", () => {
    expect(visibleSaleRows(rows, "lot", "00")).toEqual(rows);
  });

  it("searches inside the scope, never outside it", () => {
    expect(visibleSaleRows(rows, "sold", "BR-002")).toEqual([]);
  });

  it("has no rows when nothing was sold", () => {
    expect(visibleSaleRows([skipped, pending], "sold", "")).toEqual([]);
  });
});
