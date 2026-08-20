import { describe, expect, it } from "vitest";
import { solve } from "../src/strategy";

describe("example solver strategy", () => {
  it("abstains explicitly when the signed outcome has no reference route", async () => {
    await expect(solve({ policy: { inputs: [], outcomes: [] } } as never)).resolves.toEqual({
      version: 1, decision: "abstain", reasonCode: "NO_SUPPORTED_REFERENCE_ROUTE",
    });
  });
});
