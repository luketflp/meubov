/**
 * Synthetic data factories for the domain tests.
 */
import type { Animal, ManejoSession, SemenBull, Treatment } from "@/lib/types";

/** Creates a default animal for tests, with partial overrides. */
export function makeAnimal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: "animal-1",
    earTag: "BR-001",
    category: "steer",
    breed: "Angus",
    sex: "male",
    birthDate: "2024-03-10",
    lotId: "lot-1",
    active: true,
    weighings: [],
    ...overrides,
  };
}

/** Creates a default treatment for tests, with partial overrides. */
export function makeTreatment(overrides: Partial<Treatment> = {}): Treatment {
  return {
    id: "t-1",
    animalEarTag: "BR-001",
    type: "vaccine",
    name: "Vacina aftosa",
    date: "2026-08-01",
    status: "scheduled",
    withdrawalDays: 0,
    ...overrides,
  };
}

/** Creates a default semen bull for tests (no purchases), with partial overrides. */
export function makeSemenBull(overrides: Partial<SemenBull> = {}): SemenBull {
  return {
    id: "bull-1",
    name: "Tufão da Serra",
    code: "NEL-4471",
    breed: "Nelore",
    purchases: [],
    ...overrides,
  };
}

/** Creates a default open inseminação for tests, with partial overrides. */
export function makeManejoSession(overrides: Partial<ManejoSession> = {}): ManejoSession {
  return {
    id: "s-1",
    name: "Inseminação",
    date: "2026-07-01",
    status: "open",
    kind: "insemination",
    weighing: false,
    animals: [],
    ...overrides,
  };
}
