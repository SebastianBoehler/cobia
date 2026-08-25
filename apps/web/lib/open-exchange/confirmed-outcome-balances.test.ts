import { NATIVE_ASSET_ADDRESS } from "@cobia/domain";
import { describe, expect, it, vi } from "vitest";
import { assertConfirmedOutcomeBalances } from "./confirmed-outcome-balances";

const owner = "0x1111111111111111111111111111111111111111" as const;

describe("confirmed open outcome balances", () => {
  it("uses the real pinned native balance instead of the fork funding override", async () => {
    const readNativeBalance = vi.fn(async (_owner: string, blockNumber: bigint) =>
      blockNumber === 100n ? 11n : 60n);

    await expect(assertConfirmedOutcomeBalances({
      outcomes: [{ kind: "minimum-increase", chainId: 196,
        token: NATIVE_ASSET_ADDRESS, atomic: "48" }],
      evidence: { simulations: [{ blockNumber: "100", assetDeltas: [{
        token: NATIVE_ASSET_ADDRESS, account: owner,
        beforeAtomic: "100000", afterAtomic: "100048",
      }] }] },
      owner, finalBlockNumber: 120n,
      readBalance: vi.fn(async () => 0n), readNativeBalance,
    })).resolves.toBeUndefined();
    expect(readNativeBalance).toHaveBeenNthCalledWith(1, owner, 120n);
    expect(readNativeBalance).toHaveBeenNthCalledWith(2, owner, 100n);
  });

  it("rejects a final balance below the real pinned balance plus the signed increase", async () => {
    await expect(assertConfirmedOutcomeBalances({
      outcomes: [{ kind: "minimum-increase", chainId: 196,
        token: NATIVE_ASSET_ADDRESS, atomic: "50" }],
      evidence: { simulations: [{ blockNumber: "100", assetDeltas: [{
        token: NATIVE_ASSET_ADDRESS, account: owner,
      }] }] },
      owner, finalBlockNumber: 120n,
      readBalance: vi.fn(async () => 0n),
      readNativeBalance: vi.fn(async (_owner, blockNumber) => blockNumber === 100n ? 11n : 60n),
    })).rejects.toThrow(/signed outcome/i);
  });
});
