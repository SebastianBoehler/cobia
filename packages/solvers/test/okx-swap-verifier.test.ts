import { commitment } from "@cobia/domain";
import { concatHex, encodeFunctionData, erc20Abi, keccak256 } from "viem";
import { describe, expect, it, vi } from "vitest";
import { verifyOkxSwapStageV1, XLAYER_OKX_MANIFEST_V1 } from "../src";

const owner = "0x1111111111111111111111111111111111111111" as const;
const fromToken = "0x2222222222222222222222222222222222222222" as const;
const toToken = "0x3333333333333333333333333333333333333333" as const;
const router = "0x7c5bee2a8091c3ef39072f64f18fac913060aeaf" as const;
const approval = "0x8b773d83bc66be128c60e07e17c8901f7a64f000" as const;
const builderSuffix = "0x737136646c6a326f6e72386d6c357861100080218021802180218021802180218021" as const;
const data = "0xf2c426960000000000000000000000000000000000000000000000000000000000000001" as const;
const attributedData = concatHex([data, builderSuffix]);
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;

const request = {
  chainIndex: "196", amount: "10", fromTokenAddress: fromToken, toTokenAddress: toToken,
  slippagePercent: "0.5", userWalletAddress: owner, swapReceiverAddress: owner,
  swapMode: "exactIn", disableRFQ: true, approveTransaction: false,
};
const response = { code: "0", data: [{
  routerResult: {
    chainIndex: "196", swapMode: "exactIn", fromTokenAmount: "10", toTokenAmount: "21",
    fromToken: { tokenContractAddress: fromToken, isHoneyPot: false, taxRate: "0" },
    toToken: { tokenContractAddress: toToken, isHoneyPot: false, taxRate: "0" },
  },
  tx: {
    from: owner, to: router, value: "0", minReceiveAmount: "20", slippagePercent: "0.5",
    data, gas: "300000",
  },
}], msg: "" };
const artifact = {
  version: 1, provider: "okx.dex@1", stageId: "01-okx-swap",
  fetchedAt: 1_786_900_000, expiresAt: 1_786_900_030, request, response,
  attributedData,
};
const stage = {
  id: "01-okx-swap", kind: "wallet-transaction" as const, chainId: 196 as const, dependsOn: [],
  provider: "okx.dex@1", quoteHash: commitment(request), responseHash: commitment(response),
  fetchedAt: artifact.fetchedAt, expiresAt: artifact.expiresAt, sender: owner, recipient: owner,
  input: { token: fromToken, atomic: "10" },
  output: { chainId: 196 as const, token: toToken, minimumAtomic: "20" },
  approval: { token: fromToken, spender: approval, maximumAtomic: "10" },
  transaction: { target: router, selector: "0xf2c42696" as const, dataHash: keccak256(attributedData), valueAtomic: "0" },
  tools: ["okx-dex-api"],
};
const manifest = XLAYER_OKX_MANIFEST_V1;
const anchor = { chainId: 196 as const, blockNumber: "68000000", blockHash: hash("a") };
const simulation = {
  reproduced: true, transactionSuccess: true, completeOwnerAssetDiff: true,
  transactionDataHash: keccak256(attributedData), gasUsed: "250000",
  observedInputDecreaseAtomic: "10", observedOutputIncreaseAtomic: "20",
  unexpectedOwnerAssetDecreases: [], residualAllowanceAtomic: "0",
  traceHash: hash("b"), stateDiffHash: hash("c"),
};
const verify = (overrides: Partial<Parameters<typeof verifyOkxSwapStageV1>[0]> = {}) =>
  verifyOkxSwapStageV1({
    stage, artifact, manifest, anchor, nowSec: 1_786_900_005, currentAllowanceAtomic: "0",
    confirmAnchor: vi.fn().mockResolvedValue(true),
    getCodeHash: vi.fn().mockImplementation(async (_chainId, address) =>
      address === router ? manifest.router.runtimeCodeHash : manifest.approval.runtimeCodeHash),
    simulate: vi.fn().mockResolvedValue(simulation),
    ...overrides,
  });

describe("OKX strict swap stage", () => {
  it("accepts an exact attributed X Layer swap only after code and state replay", async () => {
    const result = await verifyOkxSwapStageV1({
      stage, artifact, manifest, anchor, nowSec: 1_786_900_005, currentAllowanceAtomic: "0",
      confirmAnchor: vi.fn().mockResolvedValue(true),
      getCodeHash: vi.fn().mockImplementation(async (_chainId, address) =>
        address === router ? manifest.router.runtimeCodeHash : manifest.approval.runtimeCodeHash),
      simulate: vi.fn().mockResolvedValue({
        reproduced: true, transactionSuccess: true, completeOwnerAssetDiff: true,
        transactionDataHash: keccak256(attributedData), gasUsed: "250000",
        observedInputDecreaseAtomic: "10", observedOutputIncreaseAtomic: "20",
        unexpectedOwnerAssetDecreases: [], residualAllowanceAtomic: "0",
        traceHash: hash("b"), stateDiffHash: hash("c"),
      }),
    });

    expect(result).toMatchObject({ accepted: true, evidence: { traceHash: hash("b"), stateDiffHash: hash("c") } });
    if (!result.accepted) return;
    expect(result.calls).toEqual([
      { to: fromToken, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [approval, 10n] }), value: "0x0" },
      { to: router, data: attributedData, value: "0x0" },
    ]);
  });

  it("resets an existing allowance before the exact OKX approval", async () => {
    const result = await verifyOkxSwapStageV1({
      stage, artifact, manifest, anchor, nowSec: 1_786_900_005, currentAllowanceAtomic: "7",
      confirmAnchor: vi.fn().mockResolvedValue(true),
      getCodeHash: vi.fn().mockImplementation(async (_chainId, address) =>
        address === router ? manifest.router.runtimeCodeHash : manifest.approval.runtimeCodeHash),
      simulate: vi.fn().mockResolvedValue({
        reproduced: true, transactionSuccess: true, completeOwnerAssetDiff: true,
        transactionDataHash: keccak256(attributedData), gasUsed: "250000",
        observedInputDecreaseAtomic: "10", observedOutputIncreaseAtomic: "20",
        unexpectedOwnerAssetDecreases: [], residualAllowanceAtomic: "0",
        traceHash: hash("b"), stateDiffHash: hash("c"),
      }),
    });

    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.calls[0]).toEqual({
      to: fromToken,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [approval, 0n] }),
      value: "0x0",
    });
    expect(result.calls).toHaveLength(3);
  });

  it("rejects mutation of the committed OKX response", async () => {
    const mutated = {
      ...response,
      data: [{ ...response.data[0], routerResult: { ...response.data[0]!.routerResult, toTokenAmount: "22" } }],
    };
    await expect(verify({ artifact: { ...artifact, response: mutated } })).resolves.toEqual({
      accepted: false, errorCodes: ["OKX_COMMITMENT_MISMATCH"],
    });
  });

  it("rejects recipient drift even when the changed request is re-committed", async () => {
    const other = "0x9999999999999999999999999999999999999999" as const;
    const changedRequest = { ...request, swapReceiverAddress: other };
    await expect(verify({
      artifact: { ...artifact, request: changedRequest },
      stage: { ...stage, quoteHash: commitment(changedRequest) },
    })).resolves.toEqual({ accepted: false, errorCodes: ["OKX_OWNER_MISMATCH"] });
  });

  it("rejects a router selector outside the verifier manifest", async () => {
    await expect(verify({
      manifest: { ...manifest, router: { ...manifest.router, selectors: ["0xdeadbeef"] } },
    })).resolves.toEqual({ accepted: false, errorCodes: ["OKX_SELECTOR_FORBIDDEN"] });
  });

  it("rejects calldata without the committed Cobia Builder Code suffix", async () => {
    await expect(verify({
      artifact: { ...artifact, attributedData: data },
      stage: { ...stage, transaction: { ...stage.transaction, dataHash: keccak256(data) } },
    })).resolves.toEqual({ accepted: false, errorCodes: ["OKX_CALLDATA_MISMATCH"] });
  });

  it("rejects router or approval code changes at the pinned block", async () => {
    await expect(verify({ getCodeHash: vi.fn().mockResolvedValue(hash("f")) })).resolves.toEqual({
      accepted: false, errorCodes: ["OKX_CODE_IDENTITY_CHANGED"],
    });
  });

  it.each([
    ["undeclared loss", { unexpectedOwnerAssetDecreases: [toToken] }, "OKX_UNDECLARED_ASSET_DECREASE"],
    ["residual allowance", { residualAllowanceAtomic: "1" }, "OKX_RESIDUAL_ALLOWANCE"],
    ["weak output", { observedOutputIncreaseAtomic: "19" }, "OKX_OUTPUT_TOO_LOW"],
    ["overspend", { observedInputDecreaseAtomic: "11" }, "OKX_OVERSPEND"],
  ])("rejects replay evidence with %s", async (_label, change, code) => {
    await expect(verify({ simulate: vi.fn().mockResolvedValue({ ...simulation, ...change }) })).resolves.toEqual({
      accepted: false, errorCodes: [code],
    });
  });

  it("rejects signing or authority fields in an agent-authored artifact", async () => {
    await expect(verify({ artifact: { ...artifact, privateKey: hash("f") } })).resolves.toEqual({
      accepted: false, errorCodes: ["OKX_INPUT_INVALID"],
    });
  });
});
