import { describe, expect, it } from "vitest";
import {
  MANEJO_ACTION_LABEL,
  MANEJO_ACTION_LIST,
  actionKind,
  isMovementAction,
  isSanitaryAction,
  manejoHistory,
  movementSubtitle,
  sessionWeighs,
  validateManejo,
  visibleSaleRows,
  type ManejoFields,
} from "@/components/manejo/helpers";
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

  it("gives an inseminação session its own pill, no value and no responsável", () => {
    const session = makeSession({
      id: "sess-iatf",
      kind: "insemination",
      name: "Inseminação",
      weighing: false,
      pricePerArroba: undefined,
      semenBullId: "bull-1",
      animals: [
        { earTag: "BR-001", outcome: "done", breedingId: "br-1" },
        { earTag: "BR-002", outcome: "skipped" },
      ],
    });
    const [row] = manejoHistory(noTreatments, noAnimals, [session]);
    expect(row).toMatchObject({
      kind: "insemination",
      headCount: 1,
      amountBrl: null,
      responsible: undefined,
      href: "/manejo/sess-iatf",
    });
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

describe("manejo actions", () => {
  it("offers the inseminação right after the pesagem", () => {
    expect(MANEJO_ACTION_LIST).toEqual([
      "vaccine",
      "deworming",
      "medication",
      "exam",
      "weighing",
      "insemination",
      "transfer",
      "sale",
      "entry",
    ]);
    expect(MANEJO_ACTION_LABEL.insemination).toBe("Inseminação");
  });

  it("stores an inseminação as its own kind, neither sanitary nor a movement", () => {
    expect(isSanitaryAction("insemination")).toBe(false);
    expect(isMovementAction("insemination")).toBe(false);
    expect(actionKind("insemination")).toBe("insemination");
  });

  it("keeps every treatment type a health session", () => {
    expect(actionKind("vaccine")).toBe("health");
    expect(actionKind("weighing")).toBe("weighing");
    expect(actionKind("sale")).toBe("sale");
  });
});

describe("sessionWeighs", () => {
  it("does not weigh an inseminação unless asked to", () => {
    expect(sessionWeighs({ action: "insemination", weighAlso: false, pricing: "perArroba" })).toBe(false);
    expect(sessionWeighs({ action: "insemination", weighAlso: true, pricing: "perArroba" })).toBe(true);
  });
});

describe("validateManejo", () => {
  const fields = (overrides: Partial<ManejoFields> = {}): ManejoFields => ({
    action: "insemination",
    date: "2026-09-12",
    name: "",
    dose: "",
    withdrawalDays: "0",
    responsible: "",
    costBrl: "",
    nextDate: "",
    notes: "",
    weighAlso: false,
    earTags: ["BR-001"],
    destinationLotId: "",
    counterparty: "",
    pricing: "perArroba",
    pricePerArroba: "",
    totalAmountBrl: "",
    semenBullId: "bull-1",
    ...overrides,
  });

  it("accepts an inseminação with a touro principal and a cow, without a product name", () => {
    expect(validateManejo(fields())).toEqual({});
  });

  it("asks for the touro principal of an inseminação", () => {
    expect(validateManejo(fields({ semenBullId: "" }))).toEqual({
      semenBullId: "Selecione o touro principal.",
    });
  });

  it("asks for a cow when an inseminação has no animal", () => {
    expect(validateManejo(fields({ earTags: [] }))).toEqual({
      earTags: "Selecione ao menos uma vaca.",
    });
  });

  it("keeps asking for an animal on the other kinds, with no bull needed", () => {
    expect(validateManejo(fields({ action: "weighing", earTags: [], semenBullId: "" }))).toEqual({
      earTags: "Selecione ao menos um animal.",
    });
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

describe("movementSubtitle", () => {
  it("drops the price of a venda whose values the server hid", () => {
    const session = makeSession({
      pricePerArroba: undefined,
      carcassYieldPct: 52,
      counterparty: "Frigorífico Boi Bom",
      valuesHidden: true,
    });
    expect(movementSubtitle(session, undefined)).toBe("Venda · Frigorífico Boi Bom");
    expect(movementSubtitle({ ...session, counterparty: undefined }, undefined)).toBe("Venda");
  });

  it("drops the total of a compra whose values the server hid", () => {
    const session = makeSession({
      kind: "entry",
      pricePerArroba: undefined,
      counterparty: "Fazenda Santa Luzia",
      valuesHidden: true,
    });
    expect(movementSubtitle(session, "Recria 2")).toBe(
      "Compra · entra em Recria 2 · Fazenda Santa Luzia"
    );
  });

  it("still says sem preço and sem valor when nothing was hidden", () => {
    expect(movementSubtitle(makeSession({ pricePerArroba: undefined }), undefined)).toBe(
      "Venda · sem preço"
    );
    expect(
      movementSubtitle(makeSession({ kind: "entry", pricePerArroba: undefined }), "Recria 2")
    ).toBe("Compra · sem valor · entra em Recria 2");
  });
});
