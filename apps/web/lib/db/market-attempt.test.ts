import type { RouteSnapshotV2 } from "@cobia/domain";
import { describe, expect, it } from "vitest";
import { projectMarketAttempt } from "./market-attempt";
import { createRepositoryFixtureV2 } from "./repository-test-fixtures";

describe("projectMarketAttempt", () => {
  it("projects Curve as its own protocol instead of mislabeling it as Uniswap", async () => {
    const fixture = await createRepositoryFixtureV2();
    const opportunity = {
      id: "curve-stableswap-ng:registered-pair",
      kind: "curve-stableswap-ng-exact-input" as const,
      adapterId: "curve-stableswap-ng@1" as const,
      pool: "0x31F066aA0A687d4F383F96a514984AF727Eb8e38" as const,
      tokenIn: fixture.policy.asset,
      tokenOut: fixture.policy.allowedOutputAssets.find((asset) =>
        asset !== fixture.policy.asset)!,
      inputIndex: 1 as const,
      outputIndex: 0 as const,
      fee: "1000000",
      quotedInputAtomic: "15000000",
      quotedOutputAtomic: "15001000",
    };
    const snapshot: RouteSnapshotV2 = {
      ...fixture.snapshot,
      scannedAdapters: [
        "aave-v3@1",
        "curve-stableswap-ng@1",
        "uniswap-v3@1",
      ],
      opportunities: [...fixture.snapshot.opportunities, opportunity],
    };

    const attempt = projectMarketAttempt({
      requestId: fixture.policy.requestId,
      policy: fixture.policy,
      snapshot,
      state: "failed",
      selectedQuoteId: null,
      createdAt: new Date("2026-08-11T00:00:00.000Z"),
    }, [], 1_900_000_000);

    expect(attempt.protocols).toEqual(["Aave V3", "Uniswap V3", "Curve StableSwap NG"]);
  });
});
