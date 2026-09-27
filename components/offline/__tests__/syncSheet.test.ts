import { describe, expect, it } from "vitest";
import { idleLine } from "@/components/offline/SyncSheet";

const counts = (conflict: number, failed: number) => ({ queued: 0, conflict, failed });
const at = "2026-09-25T19:26:00.000Z";

describe("idleLine", () => {
  it("says all is sent only when nothing waits", () => {
    expect(idleLine(counts(0, 0), at)).toMatch(/^Tudo enviado às /);
    expect(idleLine({ queued: 1, conflict: 0, failed: 0 }, at)).toBe("Conectado");
  });

  it("names the conflitos and falhas left instead", () => {
    expect(idleLine(counts(1, 0), at)).toBe("1 conflito espera sua escolha");
    expect(idleLine(counts(2, 0), at)).toBe("2 conflitos esperam sua escolha");
    expect(idleLine(counts(0, 1), at)).toBe("1 falha");
    expect(idleLine(counts(3, 2), undefined)).toBe("3 conflitos esperam sua escolha · 2 falhas");
  });
});
