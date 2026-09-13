import { describe, expect, it } from "vitest";
import {
  daysLeft,
  expiresInLabel,
  expiresInSentence,
  formatInstantDate,
  inviteDateLine,
  inviteExpiry,
  inviteState,
  isValidEmail,
  normalizeEmail,
} from "@/lib/domain/invites";

const now = new Date("2026-09-12T15:00:00Z");

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Zeca.Silva@Hotmail.com ")).toBe("zeca.silva@hotmail.com");
  });
});

describe("isValidEmail", () => {
  it("accepts a plain address and refuses the rest", () => {
    expect(isValidEmail("zeca@hotmail.com")).toBe(true);
    expect(isValidEmail("zeca@hotmail")).toBe(false);
    expect(isValidEmail("zeca hotmail.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("inviteExpiry", () => {
  it("lands seven days later", () => {
    expect(inviteExpiry(now).toISOString()).toBe("2026-09-19T15:00:00.000Z");
  });
});

describe("inviteState", () => {
  it("lists a pending convite until it expires", () => {
    expect(inviteState({ status: "pending", expiresAt: "2026-09-18T00:00:00Z" }, now)).toBe("pending");
    expect(inviteState({ status: "pending", expiresAt: "2026-09-12T15:00:00Z" }, now)).toBe("expired");
  });

  it("lists a declined convite and hides accepted and canceled ones", () => {
    expect(inviteState({ status: "declined", expiresAt: "2026-09-01T00:00:00Z" }, now)).toBe("declined");
    expect(inviteState({ status: "accepted", expiresAt: "2026-09-18T00:00:00Z" }, now)).toBeNull();
    expect(inviteState({ status: "canceled", expiresAt: "2026-09-18T00:00:00Z" }, now)).toBeNull();
  });
});

describe("daysLeft and expiresInLabel", () => {
  it("rounds up and never reads zero", () => {
    expect(daysLeft("2026-09-18T15:00:00Z", now)).toBe(6);
    expect(daysLeft("2026-09-12T16:00:00Z", now)).toBe(1);
    expect(expiresInLabel("2026-09-18T15:00:00Z", now)).toBe("expira em 6 dias");
    expect(expiresInLabel("2026-09-13T10:00:00Z", now)).toBe("expira em 1 dia");
    expect(expiresInSentence("2026-09-18T15:00:00Z", now)).toBe("Expira em 6 dias");
  });
});

describe("formatInstantDate", () => {
  it("prints the São Paulo calendar day", () => {
    expect(formatInstantDate("2026-09-08T12:00:00Z")).toBe("08/09/2026");
    expect(formatInstantDate("2026-09-09T02:00:00Z")).toBe("08/09/2026");
  });
});

describe("inviteDateLine", () => {
  it("reads the line under each state", () => {
    expect(
      inviteDateLine({ state: "pending", expiresAt: "2026-09-18T15:00:00Z", respondedAt: null }, now)
    ).toBe("expira em 6 dias");
    expect(
      inviteDateLine({ state: "expired", expiresAt: "2026-09-02T12:00:00Z", respondedAt: null }, now)
    ).toBe("expirou em 02/09/2026");
    expect(
      inviteDateLine(
        { state: "declined", expiresAt: "2026-09-10T12:00:00Z", respondedAt: "2026-09-08T12:00:00Z" },
        now
      )
    ).toBe("recusou em 08/09/2026");
  });
});
