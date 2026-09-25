import { describe, expect, it } from "vitest";
import { parseAmount } from "@/components/finance/parseAmount";

describe("parseAmount", () => {
  it("reads pt-BR thousands without a comma", () => expect(parseAmount("3.240")).toBe(3240));
  it("reads pt-BR thousands with cents", () => expect(parseAmount("1.234,50")).toBe(1234.5));
  it("reads a dot decimal", () => expect(parseAmount("1234.5")).toBe(1234.5));
  it("returns NaN for text", () => expect(parseAmount("abc")).toBeNaN());
});
