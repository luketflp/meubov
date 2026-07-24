/**
 * Synthetic data factories for the domain tests.
 */
import type { Animal, Treatment } from "@/lib/types";

/** Creates a default animal for tests, with partial overrides. */
export function makeAnimal(overrides: Partial<Animal> = {}): Animal {
  return {
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
