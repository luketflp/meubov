import { describe, expect, it } from "vitest";
import {
  formatArroba,
  formatKg,
  formatCurrency,
  formatNumber,
} from "@/lib/domain/format";

describe("formatNumber", () => {
  it("uses thousands dot and decimal comma (pt-BR)", () => {
    expect(formatNumber(1234.56, 2)).toBe("1.234,56");
  });

  it("rounds to 0 decimal places by default", () => {
    expect(formatNumber(1000)).toBe("1.000");
    expect(formatNumber(12.7)).toBe("13");
  });
});

describe("formatCurrency", () => {
  it("formats in reais in the pt-BR standard", () => {
    const result = formatCurrency(1234.56);
    expect(result).toContain("R$");
    expect(result).toContain("1.234,56");
  });
});

describe("formatKg", () => {
  it("formats weight with the kg suffix", () => {
    expect(formatKg(512)).toBe("512 kg");
    expect(formatKg(1250)).toBe("1.250 kg");
  });
});

describe("formatArroba", () => {
  it("formats with 1 decimal place and the @ suffix", () => {
    expect(formatArroba(16.08)).toBe("16,1 @");
  });
});
