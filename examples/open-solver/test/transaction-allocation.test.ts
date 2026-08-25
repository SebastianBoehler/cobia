import { NATIVE_ASSET_ADDRESS } from "@cobia/domain";
import { XLAYER_OKX_MANIFEST_V1 } from "@cobia/solvers";
import { concatHex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { solveTransactionAllocation } from "../src/transaction-allocation";

const owner = "0x1111111111111111111111111111111111111111" as const;
const usdg = "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8" as const;
const data = "0x0c307f760000000000000000000000000000000000000000000000000000000000000001" as const;

function artifact(minimumOutputAtomic: string) {
  const request = { chainIndex: "196", amount: "100", fromTokenAddress: usdg,
    toTokenAddress: NATIVE_ASSET_ADDRESS, slippagePercent: "0.5",
    userWalletAddress: owner, swapReceiverAddress: owner, swapMode: "exactIn",
    disableRFQ: true, approveTransaction: false } as const;
  const response = { code: "0", data: [{ routerResult: { chainIndex: "196",
    swapMode: "exactIn", fromTokenAmount: "100", toTokenAmount: minimumOutputAtomic,
    fromToken: { tokenContractAddress: usdg, isHoneyPot: false, taxRate: "0" },
    toToken: { tokenContractAddress: NATIVE_ASSET_ADDRESS, isHoneyPot: false, taxRate: "0" } },
  tx: { from: owner, to: XLAYER_OKX_MANIFEST_V1.router.address, value: "0",
    minReceiveAmount: minimumOutputAtomic, slippagePercent: "0.5", data, gas: "300000" } }],
  msg: "" } as const;
  return { version: 1 as const, provider: "okx.dex@1" as const,
    stageId: "01-okx-swap", fetchedAt: 100, expiresAt: 130, request, response,
    attributedData: concatHex([data, XLAYER_OKX_MANIFEST_V1.builderDataSuffix]) };
}

function intent(outcomeFloors: string[]) {
  return { id: "550e8400-e29b-41d4-a716-446655440000",
    policyHash: `0x${"1".repeat(64)}`, policy: { kind: "open-onchain", owner,
      deadline: 200, maxEvidenceAgeSec: 300,
      inputs: [{ chainId: 196, token: usdg, maximumAtomic: "100" }],
      outcomes: outcomeFloors.map((atomic) => ({ kind: "minimum-increase",
        chainId: 196, token: NATIVE_ASSET_ADDRESS, atomic })),
      limits: { minimumStages: 1, maxStages: 2, maxTransactions: 2, maxApprovals: 2,
        maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "0" }] },
      forbiddenAssets: [], forbiddenTargets: [] },
    snapshot: { kind: "open-onchain", anchors: [{ chainId: 196, blockNumber: "10",
      blockHash: `0x${"2".repeat(64)}` }] } } as never;
}

describe("transaction allocation", () => {
  it("enforces the strongest repeated floor for one output asset", async () => {
    const finalize = vi.fn(async () => ({ version: 1, decision: "abstain",
      reasonCode: "CAPTURED" }) as const);

    const decision = await solveTransactionAllocation(intent(["10", "5"]), { routes: [{
      inputToken: usdg, outputToken: NATIVE_ASSET_ADDRESS, inputAtomic: "100",
    }] }, { nowSec: () => 100, fetchOkxArtifact: async () => artifact("7"), finalize });

    expect(decision).toEqual({ version: 1, decision: "abstain",
      reasonCode: "NO_VERIFIED_OKX_ROUTE" });
    expect(finalize).not.toHaveBeenCalled();
  });
});
