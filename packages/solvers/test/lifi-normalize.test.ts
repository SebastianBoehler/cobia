import { describe, expect, it } from "vitest";
import { normalizeLifiQuoteV1 } from "../src/index";

const owner = "0xb6da8e6d497bd3bc5016416da57d177085449124";
const usdt0 = "0x779ded0c9e1022225f8e0630b35a9b54be713736";
const usdc = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const spacex = "0x68fa48b1c2fe52b3d776e1953e0e782b5044ce28";
const diamond = "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae";
const responseHash = `0x${"ab".repeat(32)}`;

function token(address: string, chainId: 1 | 196) {
  return { address, chainId, symbol: "TOKEN", decimals: 6, name: "Token" };
}

function quote(input: { cross?: boolean; toToken?: string } = {}) {
  const cross = input.cross ?? true;
  const fromChainId = cross ? 196 : 1;
  const toChainId = 1;
  const fromToken = cross ? usdt0 : usdc;
  const toToken = input.toToken ?? (cross ? usdc : spacex);
  const tool = cross ? "layerswap" : "sushiswap";
  return {
    id: "quote:0",
    type: "lifi",
    tool,
    action: {
      fromToken: token(fromToken, fromChainId),
      toToken: token(toToken, toChainId),
      fromAmount: "10000000",
      fromChainId,
      toChainId,
      slippage: 0.005,
      fromAddress: owner,
      toAddress: owner,
    },
    estimate: {
      tool,
      approvalAddress: diamond,
      fromAmount: "10000000",
      toAmount: cross ? "9834612" : "71276845982762164",
      toAmountMin: cross ? "9785439" : "70920461752848353",
    },
    includedSteps: [
      { type: "protocol", tool: "feeCollection" },
      { type: cross ? "cross" : "swap", tool },
    ],
    transactionRequest: {
      from: owner,
      to: diamond,
      chainId: fromChainId,
      data: `${cross ? "0x4c279d6b" : "0x5fd9ae2e"}${"00".repeat(32)}`,
      value: "0x0",
      gasLimit: "0xb908c",
    },
  };
}

function request(cross = true) {
  return {
    fromChainId: (cross ? 196 : 1) as 1 | 196,
    toChainId: 1 as const,
    fromToken: cross ? usdt0 : usdc,
    toToken: cross ? usdc : spacex,
    fromAmount: "10000000",
    fromAddress: owner,
    toAddress: owner,
    slippageBps: 50,
    allowedTools: cross
      ? ["feeCollection", "layerswap"]
      : ["feeCollection", "sushiswap"],
  };
}

describe("LI.FI quote normalization", () => {
  it("normalizes a source-bound X Layer bridge quote", () => {
    const normalized = normalizeLifiQuoteV1({
      response: quote(), request: request(), responseHash,
      fetchedAt: 2_000_000_000, expiresAt: 2_000_000_120,
    });

    expect(normalized).toMatchObject({
      quoteId: "quote:0", source: "lifi@1", responseHash,
      fromChainId: 196, toChainId: 1, fromToken: usdt0, toToken: usdc,
      fromAmount: "10000000", toAmount: "9834612", toAmountMin: "9785439",
      fromAddress: owner, toAddress: owner, approvalAddress: diamond,
      includedTools: ["feeCollection", "layerswap"],
      untrustedTransaction: { chainId: 196, from: owner, to: diamond, selector: "0x4c279d6b", value: "0x0" },
    });
  });

  it("normalizes a same-chain tokenized-instrument quote without changing its identity", () => {
    const normalized = normalizeLifiQuoteV1({
      response: quote({ cross: false }), request: request(false), responseHash,
      fetchedAt: 2_000_000_000, expiresAt: 2_000_000_120,
    });
    expect(normalized.toToken).toBe(spacex);
    expect(normalized.untrustedTransaction.selector).toBe("0x5fd9ae2e");
    expect(normalized.includedTools).toEqual(["feeCollection", "sushiswap"]);
  });

  it("rejects chain, asset, owner, amount, and slippage drift", () => {
    const variants = [
      { ...quote(), action: { ...quote().action, fromChainId: 1 } },
      { ...quote(), action: { ...quote().action, toToken: token(spacex, 1) } },
      { ...quote(), action: { ...quote().action, toAddress: diamond } },
      { ...quote(), action: { ...quote().action, fromAmount: "9999999" } },
      { ...quote(), action: { ...quote().action, slippage: 0.01 } },
    ];
    for (const response of variants) {
      expect(() => normalizeLifiQuoteV1({
        response, request: request(), responseHash,
        fetchedAt: 2_000_000_000, expiresAt: 2_000_000_120,
      })).toThrow(/request/i);
    }
  });

  it("rejects unknown tools, malformed calldata, transaction sender drift, and stale bounds", () => {
    const variants = [
      { ...quote(), tool: "evil-router" },
      { ...quote(), includedSteps: [...quote().includedSteps, { type: "swap", tool: "evil-router" }] },
      { ...quote(), transactionRequest: { ...quote().transactionRequest, data: "0x1234" } },
      { ...quote(), transactionRequest: { ...quote().transactionRequest, from: diamond } },
    ];
    for (const response of variants) {
      expect(() => normalizeLifiQuoteV1({
        response, request: request(), responseHash,
        fetchedAt: 2_000_000_000, expiresAt: 2_000_000_120,
      })).toThrow();
    }
    expect(() => normalizeLifiQuoteV1({
      response: quote(), request: request(), responseHash,
      fetchedAt: 2_000_000_000, expiresAt: 2_000_000_000,
    })).toThrow(/expiry/i);
  });
});
