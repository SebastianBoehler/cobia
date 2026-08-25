import { NATIVE_ASSET_ADDRESS } from "@cobia/domain";
import { XLAYER_OKX_MANIFEST_V1 } from "@cobia/solvers";
import { concatHex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { XLAYER_WOKB } from "../src/native-okb";
import { solveTransactionAllocation, solveTransactionIntent } from "../src/transaction-strategy";
import { PROTOCOL_REGISTRY } from "../../../apps/web/lib/adapters/registry";
import { XLAYER_CURVE_LP_TOKEN } from "../src/curve-liquidity-strategy";

const owner = "0x1111111111111111111111111111111111111111" as const;
const usdg = "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8" as const;
const usdt0 = "0x779ded0c9e1022225f8e0630b35a9b54be713736" as const;
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

function allocationArtifact(input: { stageId: string; inputToken: string; outputToken: string;
  inputAtomic: string; minimumOutputAtomic: string }) {
  return { ...artifact, stageId: input.stageId,
    request: { ...request, amount: input.inputAtomic,
      fromTokenAddress: input.inputToken, toTokenAddress: input.outputToken },
    response: { ...response, data: [{ ...response.data[0],
      routerResult: { ...response.data[0].routerResult,
        fromTokenAmount: input.inputAtomic, toTokenAmount: input.minimumOutputAtomic,
        fromToken: { tokenContractAddress: input.inputToken, isHoneyPot: false, taxRate: "0" },
        toToken: { tokenContractAddress: input.outputToken, isHoneyPot: false, taxRate: "0" } },
      tx: { ...response.data[0].tx, minReceiveAmount: input.minimumOutputAtomic },
    }] } };
}

function intent(inputToken: string, outputToken: string, minimum = "2", minimumStages = 1) {
  return { id: "550e8400-e29b-41d4-a716-446655440000", policyHash: `0x${"1".repeat(64)}`,
    policy: { kind: "open-onchain", owner, deadline: 200, maxEvidenceAgeSec: 300,
      inputs: [{ chainId: 196, token: inputToken, maximumAtomic: "100" }],
      outcomes: [{ kind: "minimum-increase", chainId: 196, token: outputToken,
        atomic: minimum }], limits: { minimumStages, maxStages: 2,
        maxTransactions: 2, maxApprovals: 2,
        maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "0" }] },
      forbiddenAssets: [], forbiddenTargets: [] },
    snapshot: { kind: "open-onchain", anchors: [{ chainId: 196, blockNumber: "10",
      blockHash: `0x${"2".repeat(64)}` }] } } as never;
}

describe("common X Layer transaction strategy", () => {
  it("constructs a free allocation across multiple signed inputs and outputs", async () => {
    const fetchOkxArtifact = vi.fn()
      .mockResolvedValueOnce(allocationArtifact({ stageId: "01-okx-swap", inputToken: usdg,
        outputToken: NATIVE_ASSET_ADDRESS, inputAtomic: "60", minimumOutputAtomic: "1" }))
      .mockResolvedValueOnce(allocationArtifact({ stageId: "02-okx-swap", inputToken: usdg,
        outputToken: XLAYER_WOKB.address, inputAtomic: "40", minimumOutputAtomic: "4" }))
      .mockResolvedValueOnce(allocationArtifact({ stageId: "03-okx-swap", inputToken: usdt0,
        outputToken: NATIVE_ASSET_ADDRESS, inputAtomic: "200", minimumOutputAtomic: "2" }));
    const finalize = vi.fn(async () => ({ version: 1, decision: "abstain",
      reasonCode: "CAPTURED" }) as const);
    const multiAsset = intent(usdg, NATIVE_ASSET_ADDRESS, "3") as never as {
      policy: { inputs: Array<{ chainId: 196; token: string; maximumAtomic: string }>;
        outcomes: Array<{ kind: "minimum-increase"; chainId: 196; token: string; atomic: string }>;
        limits: { minimumStages: number; maxStages: number; maxTransactions: number;
          maxApprovals: number } };
    };
    multiAsset.policy.inputs.push({ chainId: 196, token: usdt0, maximumAtomic: "200" });
    multiAsset.policy.outcomes.push({ kind: "minimum-increase", chainId: 196,
      token: XLAYER_WOKB.address, atomic: "4" });
    Object.assign(multiAsset.policy.limits, { maxStages: 3, maxTransactions: 3, maxApprovals: 3 });

    await solveTransactionAllocation(multiAsset as never, { routes: [
      { inputToken: usdg, outputToken: NATIVE_ASSET_ADDRESS, inputAtomic: "60" },
      { inputToken: usdg, outputToken: XLAYER_WOKB.address, inputAtomic: "40" },
      { inputToken: usdt0, outputToken: NATIVE_ASSET_ADDRESS, inputAtomic: "200" },
    ] }, {
      nowSec: () => 100, fetchOkxArtifact, finalize,
    });

    expect(fetchOkxArtifact).toHaveBeenNthCalledWith(1, expect.objectContaining({
      inputToken: usdg, inputAtomic: "60", stageId: "01-okx-swap",
    }));
    expect(fetchOkxArtifact).toHaveBeenNthCalledWith(2, expect.objectContaining({
      inputToken: usdg, inputAtomic: "40", outputToken: XLAYER_WOKB.address,
      stageId: "02-okx-swap",
    }));
    expect(fetchOkxArtifact).toHaveBeenNthCalledWith(3, expect.objectContaining({
      inputToken: usdt0, inputAtomic: "200", stageId: "03-okx-swap",
    }));
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({
      runner: "cobia-reference-okx-allocation@1",
      stages: [
        expect.objectContaining({ id: "01-okx-swap", input: { token: usdg, atomic: "60" },
          output: { chainId: 196, token: NATIVE_ASSET_ADDRESS, minimumAtomic: "1" } }),
        expect.objectContaining({ id: "02-okx-swap", input: { token: usdg, atomic: "40" },
          output: { chainId: 196, token: XLAYER_WOKB.address, minimumAtomic: "4" } }),
        expect.objectContaining({ id: "03-okx-swap", input: { token: usdt0, atomic: "200" },
          output: { chainId: 196, token: NATIVE_ASSET_ADDRESS, minimumAtomic: "2" } }),
      ],
    }));
  });

  it("routes every signed input into the sole requested output", async () => {
    const fetchOkxArtifact = vi.fn()
      .mockResolvedValueOnce(allocationArtifact({ stageId: "01-okx-swap", inputToken: usdg,
        outputToken: NATIVE_ASSET_ADDRESS, inputAtomic: "100", minimumOutputAtomic: "1" }))
      .mockResolvedValueOnce(allocationArtifact({ stageId: "02-okx-swap", inputToken: usdt0,
        outputToken: NATIVE_ASSET_ADDRESS, inputAtomic: "200", minimumOutputAtomic: "2" }));
    const finalize = vi.fn(async () => ({ version: 1, decision: "abstain",
      reasonCode: "CAPTURED" }) as const);
    const multiInput = intent(usdg, NATIVE_ASSET_ADDRESS, "3") as never as {
      policy: { inputs: Array<{ chainId: 196; token: string; maximumAtomic: string }>;
        limits: { maxStages: number; maxTransactions: number; maxApprovals: number } };
    };
    multiInput.policy.inputs.push({ chainId: 196, token: usdt0, maximumAtomic: "200" });
    Object.assign(multiInput.policy.limits, { maxStages: 2, maxTransactions: 2, maxApprovals: 2 });

    await solveTransactionIntent(multiInput as never, {
      nowSec: () => 100, fetchOkxArtifact, finalize,
    });

    expect(fetchOkxArtifact).toHaveBeenNthCalledWith(1, expect.objectContaining({
      inputToken: usdg, inputAtomic: "100", outputToken: NATIVE_ASSET_ADDRESS,
    }));
    expect(fetchOkxArtifact).toHaveBeenNthCalledWith(2, expect.objectContaining({
      inputToken: usdt0, inputAtomic: "200", outputToken: NATIVE_ASSET_ADDRESS,
    }));
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({
      runner: "cobia-reference-okx-allocation@1", stages: expect.any(Array),
    }));
  });

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

  it("asks OKX for a native OKB to arbitrary ERC-20 route", async () => {
    const nativeRequest = { ...request, fromTokenAddress: NATIVE_ASSET_ADDRESS,
      toTokenAddress: usdg };
    const nativeResponse = { ...response, data: [{ ...response.data[0],
      routerResult: { ...response.data[0].routerResult,
        fromToken: { tokenContractAddress: NATIVE_ASSET_ADDRESS,
          isHoneyPot: false, taxRate: "0" },
        toToken: { tokenContractAddress: usdg, isHoneyPot: false, taxRate: "0" } },
      tx: { ...response.data[0].tx, value: "100" } }] };
    const nativeArtifact = { ...artifact, request: nativeRequest, response: nativeResponse };
    const fetchOkxArtifact = vi.fn(async () => nativeArtifact);
    const finalize = vi.fn(async (_input: unknown) => ({ version: 1, decision: "abstain",
      reasonCode: "CAPTURED" }) as const);

    await solveTransactionIntent(intent(NATIVE_ASSET_ADDRESS, usdg), {
      nowSec: () => 100, fetchOkxArtifact, finalize,
    });

    expect(fetchOkxArtifact).toHaveBeenCalledWith(expect.objectContaining({ owner,
      inputToken: NATIVE_ASSET_ADDRESS, outputToken: usdg, inputAtomic: "100" }));
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({
      stages: [expect.objectContaining({ provider: "okx.dex@1",
        input: { token: NATIVE_ASSET_ADDRESS, atomic: "100" },
        transaction: expect.objectContaining({ valueAtomic: "100" }) })],
    }));
    const finalized = finalize.mock.lastCall?.[0] as { stages: unknown[] };
    expect(finalized.stages[0]).not.toHaveProperty("approval");
  });

  it("swaps to WOKB and unwraps when native OKB requires two wallet steps", async () => {
    const firstRequest = { ...request, toTokenAddress: XLAYER_WOKB.address };
    const firstResponse = { ...response, data: [{ ...response.data[0],
      routerResult: { ...response.data[0].routerResult, toTokenAmount: "3",
        toToken: { tokenContractAddress: XLAYER_WOKB.address, isHoneyPot: false, taxRate: "0" } },
      tx: { ...response.data[0].tx, minReceiveAmount: "3" } }] };
    const firstArtifact = { ...artifact, request: firstRequest, response: firstResponse,
      attributedData: concatHex([data, XLAYER_OKX_MANIFEST_V1.builderDataSuffix]) };
    const fetchOkxArtifact = vi.fn().mockResolvedValue(firstArtifact);
    const finalize = vi.fn(async () => ({ version: 1, decision: "abstain",
      reasonCode: "CAPTURED" }) as const);

    await solveTransactionIntent(intent(usdg, NATIVE_ASSET_ADDRESS, "2", 2), {
      nowSec: () => 100, fetchOkxArtifact, finalize,
    });

    expect(fetchOkxArtifact).toHaveBeenNthCalledWith(1, expect.objectContaining({
      inputToken: usdg, outputToken: XLAYER_WOKB.address,
      inputAtomic: "100", stageId: "01-okx-swap",
    }));
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ stages: [
      expect.objectContaining({ id: "01-okx-swap", output: expect.objectContaining({
        token: XLAYER_WOKB.address, minimumAtomic: "2" }) }),
      expect.objectContaining({ id: "02-unwrap-okb", dependsOn: ["01-okx-swap"],
        provider: "evm.raw@1", input: { token: XLAYER_WOKB.address, atomic: "3" },
        output: { chainId: 196, token: NATIVE_ASSET_ADDRESS, minimumAtomic: "3" } }),
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
