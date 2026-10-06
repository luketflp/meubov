import { describe, expect, it } from "vitest";
import { dueText } from "@/components/finance/lancamentos/EntryDetailDialog";

const TODAY = "2026-10-06";

describe("dueText", () => {
  it("says when a settled row was paid or received", () => {
    expect(dueText({ status: "paid", inflow: false, dueDate: "2026-09-10", paidAt: "2026-09-12" }, TODAY)).toBe(
      "pago em 12/09/2026"
    );
    expect(dueText({ status: "received", inflow: true, dueDate: "2026-09-10", paidAt: "2026-09-10" }, TODAY)).toBe(
      "recebido em 10/09/2026"
    );
  });

  it("counts the days to the vencimento, or since it passed", () => {
    expect(dueText({ status: "payable", inflow: false, dueDate: "2026-10-10", paidAt: null }, TODAY)).toBe(
      "vence 10/10/2026 · em 4 dias"
    );
    expect(dueText({ status: "receivable", inflow: true, dueDate: TODAY, paidAt: null }, TODAY)).toBe(
      "vence 06/10/2026 · hoje"
    );
    expect(dueText({ status: "overdue", inflow: false, dueDate: "2026-10-05", paidAt: null }, TODAY)).toBe(
      "venceu 05/10/2026 · há 1 dia"
    );
  });
});
