import { NATIVE_ASSET_ADDRESS, commitment } from "@cobia/domain";
import { XLAYER_OKX_MANIFEST_V1 } from "@cobia/solvers";
import { concatHex } from "viem";
import { describe, expect, it } from "vitest";
import { buildOkxRouteStage, fetchOkxRouteArtifact } from "../src/okx-route";

const owner = "0x1111111111111111111111111111111111111111" as const;
const inputToken = "0x2222222222222222222222222222222222222222" as const;
const data = "0xf2c426960000000000000000000000000000000000000000000000000000000000000001" as const;
const attributedData = concatHex([data, XLAYER_OKX_MANIFEST_V1.builderDataSuffix]);
const request = {
  chainIndex: "196", amount: "100", fromTokenAddress: inputToken,
  toTokenAddress: NATIVE_ASSET_ADDRESS, slippagePercent: "0.5",
  userWalletAddress: owner, swapReceiverAddress: owner,
  swapMode: "exactIn", disableRFQ: true, approveTransaction: false,
} as const;
const response = { code: "0", data: [{
  routerResult: { chainIndex: "196", swapMode: "exactIn", fromTokenAmount: "100",
    toTokenAmount: "3", fromToken: { tokenContractAddress: inputToken,
      isHoneyPot: false, taxRate: "0" }, toToken: {
      tokenContractAddress: NATIVE_ASSET_ADDRESS, isHoneyPot: false, taxRate: "0" } },
  tx: { from: owner, to: XLAYER_OKX_MANIFEST_V1.router.address, value: "0",
    minReceiveAmount: "2", slippagePercent: "0.5", data, gas: "300000" },
}], msg: "" } as const;
const artifact = { version: 1 as const, provider: "okx.dex@1" as const,
  stageId: "01-okx-swap", fetchedAt: 100, expiresAt: 130, request, response, attributedData };

describe("OKX route construction", () => {
  it("requests a signed exact-input route without approval or RFQ authority", async () => {
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain("/api/v6/dex/aggregator/swap?");
      const parsed = new URL(String(url));
      expect(Object.fromEntries(parsed.searchParams)).toMatchObject({
        chainIndex: "196", amount: "100", fromTokenAddress: inputToken,
        toTokenAddress: NATIVE_ASSET_ADDRESS, userWalletAddress: owner,
        swapReceiverAddress: owner, swapMode: "exactIn", disableRFQ: "true",
        approveTransaction: "false", slippagePercent: "0.5",
      });
      const headers = new Headers(init?.headers);
      expect(headers.get("OK-ACCESS-KEY")).toBe("key");
      expect(headers.get("OK-ACCESS-SIGN")).toBeTruthy();
      return new Response(JSON.stringify(response), { status: 200 });
    };

    await expect(fetchOkxRouteArtifact({
      credentials: { apiKey: "key", secretKey: "secret", passphrase: "pass" },
      owner, inputToken, outputToken: NATIVE_ASSET_ADDRESS, inputAtomic: "100",
      slippagePercent: "0.5", stageId: "01-okx-swap",
      now: () => new Date("2026-08-23T08:00:00.000Z"), fetchImpl,
    })).resolves.toMatchObject({
      provider: "okx.dex@1", stageId: "01-okx-swap",
      fetchedAt: 1_787_472_000, expiresAt: 1_787_472_030,
      request, response, attributedData,
    });
  });

  it("builds an exact owner-bound ERC-20 to native OKB stage", () => {
    const result = buildOkxRouteStage({ artifact, owner, inputToken,
      outputToken: NATIVE_ASSET_ADDRESS, inputAtomic: "100", minimumOutputAtomic: "2" });

    expect(result.stage).toMatchObject({
      provider: "okx.dex@1", sender: owner, recipient: owner,
      quoteHash: commitment(request), responseHash: commitment(response),
      input: { token: inputToken, atomic: "100" },
      output: { token: NATIVE_ASSET_ADDRESS, minimumAtomic: "2" },
      approval: { token: inputToken, spender: XLAYER_OKX_MANIFEST_V1.approval.address,
        maximumAtomic: "100" },
      transaction: { target: XLAYER_OKX_MANIFEST_V1.router.address,
        selector: "0xf2c42696", valueAtomic: "0" },
    });
    expect(result.providerArtifact).toEqual({
      stageId: "01-okx-swap", provider: "okx.dex@1",
      payloadHash: commitment(artifact), payload: artifact,
    });
  });

  it.each([
    ["owner", { owner: "0x9999999999999999999999999999999999999999" }],
    ["input", { inputAtomic: "101" }],
    ["output", { outputToken: "0x3333333333333333333333333333333333333333" }],
    ["floor", { minimumOutputAtomic: "3" }],
  ] as const)("rejects %s drift", (_label, change) => {
    expect(() => buildOkxRouteStage({ artifact, owner, inputToken,
      outputToken: NATIVE_ASSET_ADDRESS, inputAtomic: "100", minimumOutputAtomic: "2",
      ...change })).toThrow(/does not satisfy|mismatch/i);
  });

  it("rejects a noncanonical router even when the response remains well formed", () => {
    const changed = { ...artifact, response: { ...response, data: [{ ...response.data[0],
      tx: { ...response.data[0].tx, to: "0x9999999999999999999999999999999999999999" },
    }] } };
    expect(() => buildOkxRouteStage({ artifact: changed, owner, inputToken,
      outputToken: NATIVE_ASSET_ADDRESS, inputAtomic: "100", minimumOutputAtomic: "2" }))
      .toThrow(/router mismatch/i);
  });
});
