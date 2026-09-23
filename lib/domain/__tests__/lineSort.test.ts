import { describe, expect, it } from "vitest";
import { nextLineSort, sortLines } from "@/lib/domain/lineSort";

interface Row {
  tag: string;
  kg: number | null;
}

const rows: Row[] = [
  { tag: "A10", kg: 402 },
  { tag: "A2", kg: null },
  { tag: "a3", kg: 490 },
  { tag: "B1", kg: 402 },
];

describe("sortLines", () => {
  it("orders brincos naturally, ignoring case", () => {
    const sorted = sortLines(rows, (r) => r.tag, "asc").map((r) => r.tag);
    expect(sorted).toEqual(["A2", "a3", "A10", "B1"]);
  });

  it("orders numbers both ways, keeping ties in their original order", () => {
    expect(sortLines(rows, (r) => r.kg, "asc").map((r) => r.tag)).toEqual(["A10", "B1", "a3", "A2"]);
    expect(sortLines(rows, (r) => r.kg, "desc").map((r) => r.tag)).toEqual(["a3", "A10", "B1", "A2"]);
  });

  it("puts empty values last in either direction", () => {
    const withBlank = [{ tag: "" }, { tag: "b" }, { tag: "—" }, { tag: "a" }];
    expect(sortLines(withBlank, (r) => r.tag, "desc").map((r) => r.tag)).toEqual(["b", "a", "", "—"]);
    expect(sortLines(rows, (r) => r.kg, "asc").at(-1)?.tag).toBe("A2");
  });

  it("does not mutate the list it receives", () => {
    const copy = [...rows];
    sortLines(rows, (r) => r.tag, "desc");
    expect(rows).toEqual(copy);
  });
});

describe("nextLineSort", () => {
  it("cycles a column asc, desc, then back to the manejo's order", () => {
    const first = nextLineSort(null, "Peso");
    expect(first).toEqual({ key: "Peso", direction: "asc" });
    const second = nextLineSort(first, "Peso");
    expect(second).toEqual({ key: "Peso", direction: "desc" });
    expect(nextLineSort(second, "Peso")).toBeNull();
  });

  it("starts ascending on a new column", () => {
    expect(nextLineSort({ key: "Peso", direction: "desc" }, "Brinco")).toEqual({
      key: "Brinco",
      direction: "asc",
    });
  });
});
