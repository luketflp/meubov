import { describe, expect, it } from "vitest";
import { makeAnimal } from "@/lib/domain/__tests__/fixtures";
import { animalById } from "@/lib/store/selectors";

describe("animalById", () => {
  it("finds an animal independently of URL-sensitive ear-tag characters", () => {
    const animal = makeAnimal({ id: "animal-123", earTag: "S/N" });

    expect(animalById([animal], "animal-123")).toBe(animal);
  });

  it("does not treat an ear tag as the stable id", () => {
    const animal = makeAnimal({ id: "animal-123", earTag: "S/N" });

    expect(animalById([animal], "S/N")).toBeUndefined();
  });
});
