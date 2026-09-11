import { describe, expect, it } from "vitest";
import { WHATSAPP_TEXTS, whatsappLink } from "@/lib/marketing/whatsapp";

describe("whatsappLink", () => {
  it("builds a wa.me link with the encoded text", () => {
    expect(whatsappLink("5534999990000", "Olá! Quero saber mais sobre o MeuBov.")).toBe(
      "https://wa.me/5534999990000?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20MeuBov."
    );
  });

  it("strips anything that is not a digit from the number", () => {
    expect(whatsappLink("+55 (34) 99999-0000", "oi")).toBe("https://wa.me/5534999990000?text=oi");
  });

  it("is null without a usable number", () => {
    expect(whatsappLink(undefined, "oi")).toBeNull();
    expect(whatsappLink("", "oi")).toBeNull();
    expect(whatsappLink("   ", "oi")).toBeNull();
  });
});

describe("WHATSAPP_TEXTS", () => {
  it("names the plan and the interval on the checkout text", () => {
    expect(WHATSAPP_TEXTS.checkout("Fazenda", "month")).toBe(
      "Olá! Quero assinar o plano Fazenda (mensal) do MeuBov."
    );
    expect(WHATSAPP_TEXTS.checkout("Fazenda Pro", "year")).toBe(
      "Olá! Quero assinar o plano Fazenda Pro (anual) do MeuBov."
    );
  });
});
