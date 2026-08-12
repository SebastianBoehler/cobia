import { describe, expect, it } from "vitest";
import { createRepositoryFixtureV2 } from "../db/repository-test-fixtures";
import { projectPublicRouteSummaryV2 } from "./route-summary";

describe("public V2 route summary", () => {
  it("projects a direct Aave path without private bundle fields", async () => {
    const { bundle } = await createRepositoryFixtureV2({
      principalAtomic: "10000000",
      protocolExposureBps: 10_000,
      preferredRoute: "direct",
    });

    const summary = projectPublicRouteSummaryV2(bundle);

    expect(summary).toMatchObject({
      inputAsset: bundle.routePlan.inputAsset,
      inputAtomic: "10000000",
      retainedAtomic: "0",
      steps: [{
        kind: "supply",
        protocol: "Aave V3",
        asset: bundle.routePlan.inputAsset,
        inputAtomic: "10000000",
      }],
    });
    expect(JSON.stringify(summary)).not.toMatch(/opportunityId|signature|evidence|riskFlags/);
  });

  it("retains the enforceable swap minimum in a swap-then-supply path", async () => {
    const { bundle } = await createRepositoryFixtureV2({
      principalAtomic: "10000000",
      protocolExposureBps: 10_000,
    });

    const summary = projectPublicRouteSummaryV2(bundle);

    expect(summary.steps).toEqual([
      expect.objectContaining({
        kind: "swap",
        protocol: "Uniswap V3",
        inputAtomic: "10000000",
        minimumOutputAtomic: expect.stringMatching(/^[1-9][0-9]*$/),
      }),
      expect.objectContaining({
        kind: "supply",
        protocol: "Aave V3",
        inputAtomic: expect.stringMatching(/^[1-9][0-9]*$/),
      }),
    ]);
  });
});
