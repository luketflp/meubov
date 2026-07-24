import { beforeEach, describe, expect, it } from "vitest";
import { useHerdStore } from "@/lib/store/useHerdStore";
import type { Animal } from "@/lib/types";

const animal = (earTag: string): Animal => ({
  earTag,
  category: "steer",
  breed: "Nelore",
  sex: "male",
  birthDate: "2024-01-10",
  lotId: "lot-1",
  active: true,
  weighings: [{ date: "2026-05-01", weightKg: 300 }],
});

/** Resets the store to a minimal herd before each test. */
beforeEach(() => {
  useHerdStore.setState({
    animals: [animal("BR-1"), animal("BR-2"), animal("BR-3")],
    treatments: [],
    manejoSessions: [],
  });
});

const start = () =>
  useHerdStore.getState().startManejoSession({
    date: "2026-08-02",
    earTags: ["BR-1", "BR-2", "BR-3"],
    weighing: true,
    treatment: {
      type: "vaccine",
      name: "Vacina aftosa",
      withdrawalDays: 0,
      nextDate: "2026-12-01",
    },
  });

describe("manejo session lifecycle", () => {
  it("opens with every animal pending and applies nothing", () => {
    const id = start();
    const session = useHerdStore.getState().manejoSessions.find((m) => m.id === id)!;
    expect(session.status).toBe("open");
    expect(session.animals).toHaveLength(3);
    expect(session.animals.every((a) => a.outcome === "pending")).toBe(true);
    expect(useHerdStore.getState().treatments).toHaveLength(0);
  });

  it("completing one animal applies treatment, booster and weighing for it only", () => {
    const id = start();
    useHerdStore.getState().completeManejoAnimal(id, "BR-2", { weightKg: 312.5 });

    const { treatments, animals, manejoSessions } = useHerdStore.getState();
    expect(treatments).toHaveLength(2); // done + booster, only for BR-2
    expect(treatments[0]).toMatchObject({
      animalEarTag: "BR-2",
      status: "done",
      name: "Vacina aftosa",
      date: "2026-08-02",
    });
    expect(treatments[1]).toMatchObject({
      animalEarTag: "BR-2",
      status: "scheduled",
      date: "2026-12-01",
    });
    expect(animals.find((a) => a.earTag === "BR-2")!.weighings).toHaveLength(2);
    expect(animals.find((a) => a.earTag === "BR-1")!.weighings).toHaveLength(1);

    const entry = manejoSessions[0].animals.find((a) => a.earTag === "BR-2")!;
    expect(entry.outcome).toBe("done");
    expect(entry.weightKg).toBe(312.5);
    expect(entry.treatmentId).toBe(treatments[0].id);
  });

  it("skip records the outcome without effects; reopen reverts everything", () => {
    const id = start();
    const s = useHerdStore.getState();
    s.completeManejoAnimal(id, "BR-1", { weightKg: 305 });
    s.skipManejoAnimal(id, "BR-3", "não passou no brete");

    let session = useHerdStore.getState().manejoSessions[0];
    expect(session.animals.find((a) => a.earTag === "BR-3")!.outcome).toBe("skipped");
    expect(useHerdStore.getState().treatments).toHaveLength(2); // only BR-1's pair

    useHerdStore.getState().reopenManejoAnimal(id, "BR-1");
    session = useHerdStore.getState().manejoSessions[0];
    expect(session.animals.find((a) => a.earTag === "BR-1")!.outcome).toBe("pending");
    expect(useHerdStore.getState().treatments).toHaveLength(0);
    expect(
      useHerdStore.getState().animals.find((a) => a.earTag === "BR-1")!.weighings
    ).toHaveLength(1);
  });

  it("does not reuse treatment ids after an undo (no collisions)", () => {
    const id = start();
    useHerdStore.getState().completeManejoAnimal(id, "BR-1", { weightKg: 300 });
    useHerdStore.getState().completeManejoAnimal(id, "BR-2", { weightKg: 310 });
    useHerdStore.getState().reopenManejoAnimal(id, "BR-1");
    useHerdStore.getState().completeManejoAnimal(id, "BR-3", { weightKg: 320 });

    const ids = useHerdStore.getState().treatments.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("closed sessions refuse further changes", () => {
    const id = start();
    useHerdStore.getState().closeManejoSession(id);
    useHerdStore.getState().completeManejoAnimal(id, "BR-1", { weightKg: 300 });

    expect(useHerdStore.getState().treatments).toHaveLength(0);
    const session = useHerdStore.getState().manejoSessions[0];
    expect(session.status).toBe("closed");
    expect(session.animals.every((a) => a.outcome === "pending")).toBe(true);
  });
});
