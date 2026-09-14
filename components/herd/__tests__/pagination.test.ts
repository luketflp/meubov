import { describe, expect, it } from "vitest";
import {
  ELLIPSIS,
  pageAfterResize,
  pageWindow,
  paginate,
  rangeLabel,
} from "@/components/herd/pagination";

const hundredAndFive = Array.from({ length: 105 }, (_, index) => index + 1);

describe("paginate", () => {
  it("slices the requested page and reports the 1-based range", () => {
    const result = paginate(hundredAndFive, 2, 50);

    expect(result.items).toHaveLength(50);
    expect(result.items[0]).toBe(51);
    expect(result).toMatchObject({ page: 2, pageCount: 3, from: 51, to: 100, total: 105 });
  });

  it("ends the range at the last item on a short final page", () => {
    const result = paginate(hundredAndFive, 3, 50);

    expect(result.items).toEqual([101, 102, 103, 104, 105]);
    expect(result).toMatchObject({ from: 101, to: 105 });
  });

  it("clamps a page past the end to the last page", () => {
    expect(paginate(hundredAndFive, 99, 50).page).toBe(3);
  });

  it("clamps a page below 1 to the first page", () => {
    expect(paginate(hundredAndFive, 0, 50).page).toBe(1);
  });

  it("keeps one empty page for an empty list", () => {
    expect(paginate([], 4, 50)).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      from: 0,
      to: 0,
      total: 0,
    });
  });
});

describe("pageWindow", () => {
  it("lists every page when they fit in the seven slots", () => {
    expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("lists a single page", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
  });

  it("fills the start and hides the tail near the first page", () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5, ELLIPSIS, 20]);
    expect(pageWindow(4, 20)).toEqual([1, 2, 3, 4, 5, ELLIPSIS, 20]);
  });

  it("centres the current page with an ellipsis on each side", () => {
    expect(pageWindow(10, 20)).toEqual([1, ELLIPSIS, 9, 10, 11, ELLIPSIS, 20]);
    expect(pageWindow(5, 20)).toEqual([1, ELLIPSIS, 4, 5, 6, ELLIPSIS, 20]);
  });

  it("fills the end and hides the head near the last page", () => {
    expect(pageWindow(20, 20)).toEqual([1, ELLIPSIS, 16, 17, 18, 19, 20]);
    expect(pageWindow(17, 20)).toEqual([1, ELLIPSIS, 16, 17, 18, 19, 20]);
  });

  it("never hides a single page behind an ellipsis", () => {
    expect(pageWindow(4, 8)).toEqual([1, 2, 3, 4, 5, ELLIPSIS, 8]);
    expect(pageWindow(5, 8)).toEqual([1, ELLIPSIS, 4, 5, 6, 7, 8]);
    for (let current = 1; current <= 30; current += 1) {
      const slots = pageWindow(current, 30);
      slots.forEach((slot, index) => {
        if (slot !== ELLIPSIS) return;
        const before = slots[index - 1] as number;
        const after = slots[index + 1] as number;
        expect(after - before).toBeGreaterThan(2);
      });
    }
  });

  it("always returns seven slots once there are more than seven pages", () => {
    for (let current = 1; current <= 50; current += 1) {
      expect(pageWindow(current, 50)).toHaveLength(7);
    }
  });

  it("always includes the first, the current and the last page", () => {
    for (let current = 1; current <= 12; current += 1) {
      const slots = pageWindow(current, 12);
      expect(slots).toContain(1);
      expect(slots).toContain(current);
      expect(slots).toContain(12);
    }
  });
});

describe("rangeLabel", () => {
  it("shows the range and the total with pt-BR thousands", () => {
    expect(rangeLabel(1001, 1050, 1234)).toBe("1.001–1.050 de 1.234 animais");
  });

  it("uses the singular for a single animal", () => {
    expect(rangeLabel(1, 1, 1)).toBe("1–1 de 1 animal");
  });
});

describe("pageAfterResize", () => {
  it("keeps the first visible animal on screen when the page grows", () => {
    // Page 3 of 50 starts at animal 101, which sits on page 2 of 100.
    expect(pageAfterResize(101, 100)).toBe(2);
  });

  it("keeps the first visible animal on screen when the page shrinks", () => {
    // Page 2 of 50 starts at animal 51, which sits on page 3 of 25.
    expect(pageAfterResize(51, 25)).toBe(3);
  });

  it("goes to the first page for an empty list", () => {
    expect(pageAfterResize(0, 25)).toBe(1);
  });
});
