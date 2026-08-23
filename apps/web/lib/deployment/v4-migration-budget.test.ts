import { describe, expect, it } from "vitest";
import { assertPartitionedMigrationBudgetV4 } from "./v4-migration-budget";

const address = (byte: string) => `0x${byte.repeat(40)}` as `0x${string}`;

describe("partitioned V3/V4 migration budget", () => {
  it("values two exact fixed-dollar V3 assets and returns remaining V4 headroom", () => {
    expect(assertPartitionedMigrationBudgetV4({ chainId: 196,
      combinedProtocolBudgetUsdE8: "5000000000000", v4ProtocolCapUsdE8: "4800000000000",
      v3Assets: [
        { chainId: 196, token: address("1"), decimals: 6, fixedUsdE8PerToken: "100000000",
          maximumRemainingAtomic: "1000000000" },
        { chainId: 196, token: address("2"), decimals: 6, fixedUsdE8PerToken: "100000000",
          maximumRemainingAtomic: "1000000000" },
      ],
    })).toEqual({ combinedProtocolBudgetUsdE8: "5000000000000",
      v3RemainingUsdE8: "200000000000", v4ProtocolCapUsdE8: "4800000000000",
      unusedUsdE8: "0" });
  });

  it("rejects combined overexposure and anything except reviewed one-dollar assets", () => {
    const asset = { chainId: 196 as const, token: address("1"), decimals: 6,
      fixedUsdE8PerToken: "100000000", maximumRemainingAtomic: "1000000000" };
    expect(() => assertPartitionedMigrationBudgetV4({ chainId: 196,
      combinedProtocolBudgetUsdE8: "5000000000000", v4ProtocolCapUsdE8: "4900000000000",
      v3Assets: [asset, { ...asset, token: address("2") }] })).toThrow(/combined/i);
    expect(() => assertPartitionedMigrationBudgetV4({ chainId: 196,
      combinedProtocolBudgetUsdE8: "5000000000000", v4ProtocolCapUsdE8: "4800000000000",
      v3Assets: [{ ...asset, fixedUsdE8PerToken: "99900000" }] })).toThrow(/fixed/i);
    expect(() => assertPartitionedMigrationBudgetV4({ chainId: 196,
      combinedProtocolBudgetUsdE8: "5000000000000", v4ProtocolCapUsdE8: "4800000000000",
      v3Assets: [{ ...asset, decimals: 256 }] })).toThrow(/decimals/i);
  });
});
