import { describe, expect, it } from "vitest";
import { LOAD_FAILURE, loadFailure } from "@/components/errors/load-failure";

describe("loadFailure", () => {
  it("blames the connection when the browser says it is offline", () => {
    expect(loadFailure(false)).toBe("offline");
    expect(LOAD_FAILURE.offline.scene).toBe("sem-sinal");
  });

  it("blames the server when the browser is online", () => {
    expect(loadFailure(true)).toBe("error");
    expect(LOAD_FAILURE.error.scene).toBe("catavento-erro");
  });
});
