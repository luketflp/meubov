import { describe, expect, it } from "vitest";
import { bullDisplay, semenBullHref, shortDosesMessage } from "@/components/semen/helpers";
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

describe("shortDosesMessage", () => {
  it("names one touro short of doses for the cows picked", () => {
    expect(shortDosesMessage(["Tufão da Serra"], 19, 32)).toBe(
      "Tufão da Serra tem 19 doses para 32 vacas. Escolha mais um touro ou pule as últimas no brete."
    );
  });

  it("sums the touros picked when there is more than one", () => {
    expect(shortDosesMessage(["Tufão da Serra", "Diamante MB"], 1, 2)).toBe(
      "Os touros escolhidos têm 1 dose para 2 vacas. Escolha mais um touro ou pule as últimas no brete."
    );
  });

  it("agrees with one cow", () => {
    expect(shortDosesMessage(["Tufão da Serra"], 0, 1)).toBe(
      "Tufão da Serra tem 0 doses para 1 vaca. Escolha mais um touro ou pule as últimas no brete."
    );
  });

  it("says nothing while the doses cover the cows, or with no touro", () => {
    expect(shortDosesMessage(["Tufão da Serra"], 32, 32)).toBeNull();
    expect(shortDosesMessage(["Tufão da Serra"], 40, 32)).toBeNull();
    expect(shortDosesMessage([], 0, 5)).toBeNull();
  });
});
