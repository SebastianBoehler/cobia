import { describe, expect, it, vi } from "vitest";
import { solve } from "../src/strategy";

describe("example solver strategy", () => {
  it("reports that no route was verified before the search deadline", async () => {
    await expect(solve({ policy: { inputs: [], outcomes: [] } } as never)).resolves.toEqual({
      version: 1, decision: "abstain", reasonCode: "NO_VERIFIED_ROUTE_BEFORE_DEADLINE",
    });
  });

  it("routes an arbitrary X Layer xStock policy through the general asset solver", async () => {
    const solveGeneralAsset = vi.fn().mockResolvedValue({
      version: 1, decision: "abstain", reasonCode: "TEST_GENERAL_ASSET_ROUTE",
    });
    const intent = { policy: { kind: "general-asset", outputs: [{
      chainId: 196, token: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }] }, snapshot: { kind: "general-asset-evidence" } } as never;

    await expect(solve(intent, { solveGeneralAsset })).resolves.toMatchObject({
      reasonCode: "TEST_GENERAL_ASSET_ROUTE",
    });
    expect(solveGeneralAsset).toHaveBeenCalledWith(intent);
  });
});
