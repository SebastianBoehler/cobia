import { NATIVE_ASSET_ADDRESS } from "@cobia/domain";
import { decodeFunctionData, encodeFunctionData, erc20Abi } from "viem";
import { describe, expect, it, vi } from "vitest";
import { createOkxGeneralAssetSwapCompilerV1 } from "./general-asset-swap";

const executor = "0x1111111111111111111111111111111111111111" as const;
const owner = "0x2222222222222222222222222222222222222222" as const;
const inputToken = "0x3333333333333333333333333333333333333333" as const;
const outputToken = "0x4444444444444444444444444444444444444444" as const;
const router = "0x5555555555555555555555555555555555555555" as const;
const spender = "0x6666666666666666666666666666666666666666" as const;
const calldata = "0x12345678aabb" as const;

function responses(overrides: { from?: string; minimum?: string; spender?: string;
  approvalAddress?: string; signatureData?: string[]; inputToken?: string; value?: string } = {}) {
  const approveData = encodeFunctionData({ abi: erc20Abi, functionName: "approve",
    args: [(overrides.spender ?? spender) as `0x${string}`, 100n] });
  return [{ code: "0", msg: "", data: [{ routerResult: { chainIndex: "196", swapMode: "exactIn",
    fromTokenAmount: "100", toTokenAmount: "95",
    fromToken: { tokenContractAddress: overrides.inputToken ?? inputToken, isHoneyPot: false, taxRate: "0" },
    toToken: { tokenContractAddress: outputToken, isHoneyPot: false, taxRate: "0" } },
  tx: { from: overrides.from ?? executor, to: router, value: overrides.value ?? "0",
    minReceiveAmount: overrides.minimum ?? "90", slippagePercent: "1", data: calldata, gas: "300000",
    signatureData: overrides.signatureData ?? [JSON.stringify({ approveContract:
      overrides.approvalAddress ?? overrides.spender ?? spender, approveTxCalldata: approveData })] } }] }];
}

function compiler(values = responses()) {
  let index = 0;
  const fetch = vi.fn(async (...args: Parameters<typeof globalThis.fetch>) => {
    void args;
    return new Response(JSON.stringify(values[index++]!), { status: 200 });
  });
  return { fetch, compiler: createOkxGeneralAssetSwapCompilerV1({
    credentials: { apiKey: "key", secretKey: "secret", passphrase: "pass" },
    fetch: fetch as typeof globalThis.fetch, now: () => new Date(2_000_000_000_000),
  }) };
}

const request = { chainId: 196 as const, executor, owner, inputToken, outputToken,
  inputAtomic: "100", minimumOutputAtomic: "90", maximumSlippageBps: 100 };

describe("authenticated OKX general asset swap compiler", () => {
  it("binds approve and exact-in swap responses to the execution request", async () => {
    const { compiler: value, fetch } = compiler();
    const compiled = await value.compile(request);
    expect(compiled).toMatchObject({ target: router, data: calldata, valueAtomic: "0",
      gasLimit: 300000, approval: { spender, maximumAtomic: "100" },
      fetchedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_030 });
    if (!compiled.approval) throw new Error("Expected ERC-20 approval");
    expect(decodeFunctionData({ abi: erc20Abi, data: compiled.approval.data })).toMatchObject({
      functionName: "approve", args: [spender, 100n],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    for (const [url, init] of fetch.mock.calls) {
      expect(url).toMatch(/^https:\/\/web3\.okx\.com\/api\/v6\/dex\/aggregator\/swap/);
      expect((init as RequestInit).headers).toMatchObject({ "OK-ACCESS-KEY": "key" });
    }
    expect(fetch.mock.calls[0]![0]).toContain(`userWalletAddress=${executor}`);
    expect(fetch.mock.calls[0]![0]).toContain(`swapReceiverAddress=${owner}`);
    expect(fetch.mock.calls[0]![0]).toContain("swapMode=exactIn");
    expect(fetch.mock.calls[0]![0]).toContain("approveAmount=100");
    expect(fetch.mock.calls[0]![0]).toContain("approveTransaction=true");
  });

  it("compiles native input as exact call value without approval metadata", async () => {
    const values = responses({ inputToken: NATIVE_ASSET_ADDRESS, value: "100", signatureData: [] });
    const { compiler: value, fetch } = compiler(values);

    const compiled = await value.compile({ ...request, inputToken: NATIVE_ASSET_ADDRESS });

    expect(compiled).toMatchObject({ target: router, valueAtomic: "100" });
    expect(compiled).not.toHaveProperty("approval");
    expect(fetch.mock.calls[0]![0]).toContain("approveTransaction=false");
    expect(fetch.mock.calls[0]![0]).not.toContain("approveAmount");
  });

  it.each([
    [responses({ from: owner }), /sender/i],
    [responses({ minimum: "89" }), /minimum/i],
    [responses({ approvalAddress: router }), /approval/i],
    [responses({ signatureData: ["not-json"] }), /approval/i],
  ])("rejects mismatched authenticated compilation", async (values, error) => {
    await expect(compiler(values).compiler.compile(request)).rejects.toThrow(error);
  });
});
