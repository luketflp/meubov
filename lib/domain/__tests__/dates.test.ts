import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  formatDate,
  formatAge,
  today,
  todayISO,
  ageInMonths,
  parseISODate,
  firstDayOfMonth,
  monthYearLabel,
  toISO,
  lastDayOfMonth,
} from "@/lib/domain/dates";

describe("parseISODate", () => {
  it("parses as a local date without timezone off-by-one", () => {
    const d = parseISODate("2026-07-24");
    expect(d.getDate()).toBe(24);
    expect(d.getMonth()).toBe(6);
    expect(d.getFullYear()).toBe(2026);
  });
});

describe("todayISO / today", () => {
  it("returns the current date as YYYY-MM-DD", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("today() is the local-midnight Date of todayISO()", () => {
    expect(toISO(today())).toBe(todayISO());
  });
});

describe("toISO", () => {
  it("converts a local Date into ISO with leading zeros", () => {
    expect(toISO(new Date(2026, 6, 24))).toBe("2026-07-24");
    expect(toISO(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("daysBetween", () => {
  it("computes b - a in days", () => {
    expect(daysBetween("2026-07-01", "2026-07-24")).toBe(23);
  });

  it("returns negative when b is before a", () => {
    expect(daysBetween("2026-07-24", "2026-07-01")).toBe(-23);
  });
});

describe("addDays", () => {
  it("adds days crossing the year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("accepts negative n", () => {
    expect(addDays("2026-07-24", -30)).toBe("2026-06-24");
  });
});

describe("ageInMonths", () => {
  it("counts complete months", () => {
    expect(ageInMonths("2024-03-10", "2026-07-24")).toBe(28);
  });

  it("discounts the month when the day has not arrived yet", () => {
    expect(ageInMonths("2024-07-25", "2026-07-24")).toBe(23);
  });
});

describe("formatAge", () => {
  it("formats years and months", () => {
    expect(formatAge("2024-03-10", "2026-07-24")).toBe("2a 4m");
  });

  it("formats only months below 1 year", () => {
    expect(formatAge("2025-11-24", "2026-07-24")).toBe("8m");
  });

  it("formats exact years without months", () => {
    expect(formatAge("2024-07-24", "2026-07-24")).toBe("2a");
  });
});

describe("formatDate", () => {
  it("formats as dd/mm/aaaa", () => {
    expect(formatDate("2026-07-24")).toBe("24/07/2026");
  });
});

describe("monthYearLabel", () => {
  it("generates a short month/year label", () => {
    expect(monthYearLabel("2026-07-24")).toBe("jul/26");
    expect(monthYearLabel("2025-01-01")).toBe("jan/25");
  });
});

describe("firstDayOfMonth / lastDayOfMonth", () => {
  it("returns the month boundaries", () => {
    expect(firstDayOfMonth("2026-07-24")).toBe("2026-07-01");
    expect(lastDayOfMonth("2026-07-24")).toBe("2026-07-31");
  });

  it("handles February of a non-leap year", () => {
    expect(lastDayOfMonth("2026-02-10")).toBe("2026-02-28");
  });
});
