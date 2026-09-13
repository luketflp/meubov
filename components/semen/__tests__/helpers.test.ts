import { describe, expect, it } from "vitest";
import { bullDisplay, semenBullHref } from "@/components/semen/helpers";
import type { SemenBull } from "@/lib/types";

const tufao: SemenBull = {
  id: "sb-1",
  name: "Tufão da Serra",
  code: "NEL-4471",
  purchases: [],
};

describe("bullDisplay", () => {
  it("names a registered bull and links to its page", () => {
    expect(
      bullDisplay({ bullEarTag: "NEL-4471", semenBullId: "sb-1" }, [tufao])
    ).toEqual({ label: "Tufão da Serra", href: semenBullHref("sb-1") });
  });

  it("keeps the stored tag for a herd bull or a typed code", () => {
    expect(bullDisplay({ bullEarTag: "BR-900" }, [tufao])).toEqual({
      label: "BR-900",
      href: null,
    });
  });

  it("falls back to the stored tag when the bull is not in the store", () => {
    expect(bullDisplay({ bullEarTag: "NEL-4471", semenBullId: "sb-9" }, [tufao])).toEqual({
      label: "NEL-4471",
      href: null,
    });
  });
});
