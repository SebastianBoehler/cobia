import { NATIVE_ASSET_ADDRESS } from "@cobia/domain";
import { XLAYER_OKX_MANIFEST_V1 } from "@cobia/solvers";
import { concatHex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { XLAYER_WOKB } from "../src/native-okb";
import { solveTransactionIntent } from "../src/transaction-strategy";
import { PROTOCOL_REGISTRY } from "../../../apps/web/lib/adapters/registry";
import { XLAYER_CURVE_LP_TOKEN } from "../src/curve-liquidity-strategy";

const owner = "0x1111111111111111111111111111111111111111" as const;
const usdg = "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8" as const;
const data = "0x0c307f760000000000000000000000000000000000000000000000000000000000000001" as const;
const request = { chainIndex: "196", amount: "100", fromTokenAddress: usdg,
  toTokenAddress: NATIVE_ASSET_ADDRESS, slippagePercent: "0.5",
  userWalletAddress: owner, swapReceiverAddress: owner, swapMode: "exactIn",
  disableRFQ: true, approveTransaction: false } as const;
const response = { code: "0", data: [{ routerResult: { chainIndex: "196",
  swapMode: "exactIn", fromTokenAmount: "100", toTokenAmount: "3",
  fromToken: { tokenContractAddress: usdg, isHoneyPot: false, taxRate: "0" },
  toToken: { tokenContractAddress: NATIVE_ASSET_ADDRESS, isHoneyPot: false, taxRate: "0" } },
tx: { from: owner, to: XLAYER_OKX_MANIFEST_V1.router.address, value: "0",
  minReceiveAmount: "2", slippagePercent: "0.5", data, gas: "300000" } }], msg: "" } as const;
const artifact = { version: 1 as const, provider: "okx.dex@1" as const,
  stageId: "01-okx-swap", fetchedAt: 100, expiresAt: 130, request, response,
  attributedData: concatHex([data, XLAYER_OKX_MANIFEST_V1.builderDataSuffix]) };

function intent(inputToken: string, outputToken: string, minimum = "2", minimumStages = 1) {
  return { id: "550e8400-e29b-41d4-a716-446655440000", policyHash: `0x${"1".repeat(64)}`,
    policy: { kind: "open-onchain", owner, deadline: 200, maxEvidenceAgeSec: 300,
      inputs: [{ chainId: 196, token: inputToken, maximumAtomic: "100" }],
      outcomes: [{ kind: "minimum-increase", chainId: 196, token: outputToken,
        atomic: minimum }], limits: { minimumStages, maxStages: 2,
        maxTransactions: 2, maxApprovals: 2 }, forbiddenAssets: [] },
    snapshot: { kind: "open-onchain", anchors: [{ chainId: 196, blockNumber: "10",
      blockHash: `0x${"2".repeat(64)}` }] } } as never;
}

describe("common X Layer transaction strategy", () => {
  it("uses canonical WOKB directly for a native conversion", async () => {
    const finalize = vi.fn(async () => ({ version: 1, decision: "abstain",
      reasonCode: "CAPTURED" }) as const);

    await solveTransactionIntent(intent(NATIVE_ASSET_ADDRESS, XLAYER_WOKB.address, "100"), {
      nowSec: () => 100, fetchOkxArtifact: vi.fn(), finalize,
    });

    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({
      stages: [expect.objectContaining({ provider: "evm.raw@1",
        transaction: expect.objectContaining({ selector: "0xd0e30db0", valueAtomic: "100" }) })],
    }));
  });

  it("asks OKX for an exact owner-bound ERC-20 to native route", async () => {
    const fetchOkxArtifact = vi.fn(async () => artifact);
    const finalize = vi.fn(async () => ({ version: 1, decision: "abstain",
      reasonCode: "CAPTURED" }) as const);

    await solveTransactionIntent(intent(usdg, NATIVE_ASSET_ADDRESS), {
      nowSec: () => 100, fetchOkxArtifact, finalize,
    });

    expect(fetchOkxArtifact).toHaveBeenCalledWith(expect.objectContaining({ owner,
      inputToken: usdg, outputToken: NATIVE_ASSET_ADDRESS, inputAtomic: "100" }));
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({
      stages: [expect.objectContaining({ provider: "okx.dex@1",
        output: { chainId: 196, token: NATIVE_ASSET_ADDRESS, minimumAtomic: "2" } })],
    }));
  });

  it("uses a registered stablecoin hop when the signed policy requires two wallet steps", async () => {
    const intermediate = PROTOCOL_REGISTRY.aaveV3.assets.USDt0.underlying.address.toLowerCase();
    const firstRequest = { ...request, toTokenAddress: intermediate };
    const firstResponse = { ...response, data: [{ ...response.data[0],
      routerResult: { ...response.data[0].routerResult, toTokenAmount: "100",
        toToken: { tokenContractAddress: intermediate, isHoneyPot: false, taxRate: "0" } },
      tx: { ...response.data[0].tx, minReceiveAmount: "99" } }] };
    const firstArtifact = { ...artifact, request: firstRequest, response: firstResponse,
      attributedData: concatHex([data, XLAYER_OKX_MANIFEST_V1.builderDataSuffix]) };
    const secondRequest = { ...request, amount: "99", fromTokenAddress: intermediate };
    const secondResponse = { ...response, data: [{ ...response.data[0],
      routerResult: { ...response.data[0].routerResult, fromTokenAmount: "99",
        fromToken: { tokenContractAddress: intermediate, isHoneyPot: false, taxRate: "0" } } }] };
    const secondArtifact = { ...artifact, stageId: "02-okx-swap",
      request: secondRequest, response: secondResponse };
    const fetchOkxArtifact = vi.fn()
      .mockResolvedValueOnce(firstArtifact)
      .mockResolvedValueOnce(secondArtifact);
    const finalize = vi.fn(async () => ({ version: 1, decision: "abstain",
      reasonCode: "CAPTURED" }) as const);

    await solveTransactionIntent(intent(usdg, NATIVE_ASSET_ADDRESS, "2", 2), {
      nowSec: () => 100, fetchOkxArtifact, finalize,
    });

    expect(fetchOkxArtifact).toHaveBeenNthCalledWith(1, expect.objectContaining({
      inputToken: usdg, outputToken: intermediate, inputAtomic: "100", stageId: "01-okx-swap",
    }));
    expect(fetchOkxArtifact).toHaveBeenNthCalledWith(2, expect.objectContaining({
      inputToken: intermediate, outputToken: NATIVE_ASSET_ADDRESS,
      inputAtomic: "99", stageId: "02-okx-swap",
    }));
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ stages: [
      expect.objectContaining({ id: "01-okx-swap", output: expect.objectContaining({
        token: intermediate, minimumAtomic: "99" }) }),
      expect.objectContaining({ id: "02-okx-swap", dependsOn: ["01-okx-swap"],
        input: { token: intermediate, atomic: "99" } }),
    ] }));
  });

  it("withdraws an Aave receipt before routing its exact underlying into native OKB", async () => {
    const fetchOkxArtifact = vi.fn(async () => ({ ...artifact, stageId: "02-okx-swap" }));
    const finalize = vi.fn(async () => ({ version: 1, decision: "abstain",
      reasonCode: "CAPTURED" }) as const);
    const aToken = PROTOCOL_REGISTRY.aaveV3.assets.USDG.aToken.address;

    await solveTransactionIntent(intent(aToken, NATIVE_ASSET_ADDRESS), {
      nowSec: () => 100, fetchOkxArtifact, finalize,
    });

    expect(fetchOkxArtifact).toHaveBeenCalledWith(expect.objectContaining({
      inputToken: usdg, inputAtomic: "100", outputToken: NATIVE_ASSET_ADDRESS,
    }));
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ stages: [
      expect.objectContaining({ id: "01-aave-withdraw", provider: "evm.raw@1",
        input: { token: aToken.toLowerCase(), atomic: "100" },
        output: { chainId: 196, token: usdg, minimumAtomic: "100" } }),
      expect.objectContaining({ id: "02-okx-swap", provider: "okx.dex@1",
        dependsOn: ["01-aave-withdraw"], input: { token: usdg, atomic: "100" } }),
    ] }));
  });

  it("withdraws an Aave receipt directly when its underlying is the requested output", async () => {
    const fetchOkxArtifact = vi.fn();
    const finalize = vi.fn(async () => ({ version: 1, decision: "abstain",
      reasonCode: "CAPTURED" }) as const);
    const asset = PROTOCOL_REGISTRY.aaveV3.assets.USDG;

    await solveTransactionIntent(intent(asset.aToken.address, asset.underlying.address, "99"), {
      nowSec: () => 100, fetchOkxArtifact, finalize,
    });

    expect(fetchOkxArtifact).not.toHaveBeenCalled();
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({
      stages: [expect.objectContaining({ id: "01-aave-withdraw", provider: "evm.raw@1",
        input: { token: asset.aToken.address.toLowerCase(), atomic: "100" },
        output: { chainId: 196, token: asset.underlying.address.toLowerCase(), minimumAtomic: "100" } })],
      runner: "cobia-reference-aave-withdraw@1",
    }));
  });

  it.each([
    [usdg, XLAYER_CURVE_LP_TOKEN, "add-liquidity"],
    [XLAYER_CURVE_LP_TOKEN, PROTOCOL_REGISTRY.aaveV3.assets.USDt0.underlying.address,
      "remove-one-coin"],
  ] as const)("constructs a bounded Curve liquidity action", async (
    inputToken, outputToken, tool,
  ) => {
    const finalize = vi.fn(async () => ({ version: 1, decision: "abstain",
      reasonCode: "CAPTURED" }) as const);
    const fetchOkxArtifact = vi.fn();

    await solveTransactionIntent(intent(inputToken, outputToken, "90"), {
      nowSec: () => 100, fetchOkxArtifact, finalize,
    });

    expect(fetchOkxArtifact).not.toHaveBeenCalled();
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({
      stages: [expect.objectContaining({ provider: "evm.raw@1",
        tools: [`curve-stableswap-ng.${tool}`] })],
      runner: "cobia-reference-curve-liquidity@1",
    }));
  });

  it("does not claim an OKX route when the signed shape is not a single X Layer conversion", async () => {
    const fetchOkxArtifact = vi.fn();
    await expect(solveTransactionIntent({ policy: { kind: "open-onchain", inputs: [],
      outcomes: [] } } as never, { nowSec: () => 100, fetchOkxArtifact,
      finalize: vi.fn() })).resolves.toBeUndefined();
    expect(fetchOkxArtifact).not.toHaveBeenCalled();
  });
});
