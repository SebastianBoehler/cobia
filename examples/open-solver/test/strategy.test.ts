import { describe, expect, it } from "vitest";
import { solve } from "../src/strategy";

describe("example solver strategy", () => {
  it("abstains explicitly until a real strategy is configured", async () => {
    await expect(solve({} as never)).resolves.toEqual({
      version: 1, decision: "abstain", reasonCode: "NO_LOCAL_STRATEGY",
    });
  });
});
