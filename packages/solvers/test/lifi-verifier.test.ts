import { describe, expect, it, vi } from "vitest";
import { normalizeLifiQuoteV1, verifyLifiWalletTransactionV1 } from "../src/index";

const owner = "0xb6da8e6d497bd3bc5016416da57d177085449124";
const usdt0 = "0x779ded0c9e1022225f8e0630b35a9b54be713736";
const usdc = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const diamond = "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae";
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const codeHashes = {
  diamond196: hash("1"), diamond1: hash("2"), usdt0: hash("3"), usdc: hash("4"),
};

const response = {
  id: "bridge:0", type: "lifi", tool: "layerswap",
  action: {
    fromToken: { address: usdt0, chainId: 196, symbol: "USD₮0", decimals: 6, name: "USD₮0" },
    toToken: { address: usdc, chainId: 1, symbol: "USDC", decimals: 6, name: "USD Coin" },
    fromAmount: "10000000", fromChainId: 196, toChainId: 1, slippage: 0.005,
    fromAddress: owner, toAddress: owner,
  },
  estimate: {
    tool: "layerswap", approvalAddress: diamond, fromAmount: "10000000",
    toAmount: "9834612", toAmountMin: "9785439",
  },
  includedSteps: [
    { type: "protocol", tool: "feeCollection" },
    { type: "cross", tool: "layerswap" },
  ],
  transactionRequest: {
    from: owner, to: diamond, chainId: 196,
    data: `0x4c279d6b${"00".repeat(32)}`, value: "0x0", gasLimit: "0xb908c",
  },
};

const quote = normalizeLifiQuoteV1({
  response,
  request: {
    fromChainId: 196, toChainId: 1, fromToken: usdt0, toToken: usdc,
    fromAmount: "10000000", fromAddress: owner, toAddress: owner,
    slippageBps: 50, allowedTools: ["feeCollection", "layerswap"],
  },
  responseHash: hash("a"), fetchedAt: 1_999_999_900, expiresAt: 2_000_000_200,
});

const manifest = {
  version: 1 as const,
  deployments: [
    { chainId: 1 as const, address: diamond, runtimeCodeHash: codeHashes.diamond1,
      selectors: ["0x5fd9ae2e"], tools: ["feeCollection", "sushiswap"] },
    { chainId: 196 as const, address: diamond, runtimeCodeHash: codeHashes.diamond196,
      selectors: ["0x4c279d6b"], tools: ["feeCollection", "layerswap"] },
  ],
  assets: [
    { chainId: 1 as const, address: usdc, runtimeCodeHash: codeHashes.usdc },
    { chainId: 196 as const, address: usdt0, runtimeCodeHash: codeHashes.usdt0 },
  ],
};

const anchors = [
  { chainId: 1 as const, blockNumber: "21000000", blockHash: hash("b") },
  { chainId: 196 as const, blockNumber: "68000000", blockHash: hash("c") },
];

function dependencies() {
  return {
    confirmAnchor: vi.fn().mockResolvedValue(true),
    getCodeHash: vi.fn(async (chainId: 1 | 196, address: string) => {
      const key = `${chainId}:${address}`;
      return new Map([
        [`196:${diamond}`, codeHashes.diamond196], [`1:${diamond}`, codeHashes.diamond1],
        [`196:${usdt0}`, codeHashes.usdt0], [`1:${usdc}`, codeHashes.usdc],
      ]).get(key);
    }),
    simulate: vi.fn().mockResolvedValue({
      reproduced: true, transactionSuccess: true, completeOwnerAssetDiff: true,
      transactionDataHash: quote.untrustedTransaction.dataHash,
      gasUsed: "500000", observedInputDecreaseAtomic: "10000000",
      observedOutputIncreaseAtomic: "0", unexpectedOwnerAssetDecreases: [],
      traceHash: hash("d"), stateDiffHash: hash("e"),
    }),
  };
}

async function verify(overrides: Record<string, unknown> = {}) {
  const deps = dependencies();
  const result = await verifyLifiWalletTransactionV1({
    quote, manifest, anchors, nowSec: 2_000_000_000,
    policy: {
      owner, maximumInputAtomic: "10000000", minimumOutputAtomic: "9785439",
      deadline: 2_000_000_180, forbiddenTargets: [], forbiddenAssets: [],
    },
    ...deps,
    ...overrides,
  });
  return { result, deps };
}

describe("LI.FI wallet transaction verifier", () => {
  it("emits exact bounded requests only after code, anchor, and simulation checks", async () => {
    const { result, deps } = await verify();

    expect(result.accepted).toBe(true);
    if (!result.accepted) throw new Error("Expected accepted quote");
    expect(result.guarantee).toBe("asynchronous-delivery");
    expect(result.approvals).toHaveLength(1);
    expect(result.approvals[0]).toMatchObject({ to: usdt0, value: "0x0" });
    expect(result.transaction).toEqual({
      to: diamond, data: quote.untrustedTransaction.data, value: "0x0",
    });
    expect(result.evidence).toMatchObject({ traceHash: hash("d"), stateDiffHash: hash("e") });
    expect(deps.confirmAnchor).toHaveBeenCalledTimes(2);
  });

  it("rejects target, selector, value, approval, and tool expansion without requests", async () => {
    const variants = [
      { ...quote, untrustedTransaction: { ...quote.untrustedTransaction, to: owner } },
      { ...quote, untrustedTransaction: { ...quote.untrustedTransaction, selector: "0xdeadbeef" } },
      { ...quote, untrustedTransaction: { ...quote.untrustedTransaction, value: "0x1" } },
      { ...quote, approvalAddress: owner },
      { ...quote, includedTools: [...quote.includedTools, "evil"] },
    ];
    for (const changed of variants) {
      const { result } = await verify({ quote: changed });
      expect(result.accepted).toBe(false);
      expect(result).not.toHaveProperty("transaction");
      expect(result).not.toHaveProperty("approvals");
    }
  });

  it("rejects code changes, stale or reorged anchors, and stale quotes", async () => {
    expect((await verify({ getCodeHash: vi.fn().mockResolvedValue(hash("f")) })).result.accepted).toBe(false);
    expect((await verify({ confirmAnchor: vi.fn().mockResolvedValue(false) })).result.accepted).toBe(false);
    expect((await verify({ nowSec: quote.expiresAt })).result.accepted).toBe(false);
    expect((await verify({ nowSec: quote.fetchedAt + 301 })).result.accepted).toBe(false);
  });

  it("rejects spoofed simulation, overspend, undeclared decreases, and weak output", async () => {
    const base = await dependencies().simulate();
    const variants = [
      { ...base, reproduced: false },
      { ...base, transactionSuccess: false },
      { ...base, completeOwnerAssetDiff: false },
      { ...base, transactionDataHash: hash("f") },
      { ...base, observedInputDecreaseAtomic: "10000001" },
      { ...base, unexpectedOwnerAssetDecreases: [usdc] },
    ];
    for (const simulation of variants) {
      const { result } = await verify({ simulate: vi.fn().mockResolvedValue(simulation) });
      expect(result.accepted).toBe(false);
    }
  });

  it("requires minimum output during same-chain acquisition", async () => {
    const sameChain = {
      ...quote, fromChainId: 1 as const, fromToken: usdc, toChainId: 1 as const,
      toToken: usdt0, includedTools: ["feeCollection", "sushiswap"],
      approvalAddress: diamond,
      untrustedTransaction: {
        ...quote.untrustedTransaction, chainId: 1 as const, selector: "0x5fd9ae2e",
      },
    };
    const simulation = { ...await dependencies().simulate(), observedOutputIncreaseAtomic: "9785438" };
    const { result } = await verify({ quote: sameChain, simulate: vi.fn().mockResolvedValue(simulation) });
    expect(result.accepted).toBe(false);
  });
});
