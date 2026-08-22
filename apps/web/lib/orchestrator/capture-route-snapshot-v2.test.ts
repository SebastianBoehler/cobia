import { describe, expect, it } from "vitest";
import { ProtocolIneligibleError } from "../adapters/protocol-error";
import { PROTOCOL_REGISTRY, registryHash } from "../adapters/registry";
import { captureRouteSnapshotV2 } from "./capture-route-snapshot-v2";
import {
  block,
  dependencies,
  lookbackBlock,
  policy,
  reserve,
  uniswapQuote,
  usdg,
  usdt0,
} from "./capture-route-snapshot-v2.test-fixture";

describe("captureRouteSnapshotV2", () => {
  it("captures an amount-specific full-range LP opportunity from historical fees", async () => {
    const deps = dependencies();
    const snapshot = await captureRouteSnapshotV2(policy, deps);

    expect(snapshot.opportunities).toContainEqual({
      id: `uniswap-v3-lp:${usdt0.toLowerCase()}:${usdg.toLowerCase()}:100:50000000`,
      kind: "uniswap-v3-full-range-lp",
      adapterId: "uniswap-v3@1",
      pool: PROTOCOL_REGISTRY.uniswapV3.pair.pool.address.toLowerCase(),
      token0: usdg.toLowerCase(),
      token1: usdt0.toLowerCase(),
      feeTier: 100,
      tickLower: -887272,
      tickUpper: 887272,
      historicalFeeApyBps: 273,
      tvlUsdE6: "1999112520",
      lookbackSeconds: 86_400,
      validatedInputAsset: usdt0.toLowerCase(),
      validatedInputAtomic: "50000000",
      balanceSwapInputAtomic: "25000000",
      quotedSwapOutputAtomic: "24950000",
      amount0DesiredAtomic: "24950000",
      amount1DesiredAtomic: "25000000",
      quotedLiquidity: "24950000",
      minimumLiquidity: "24700500",
    });
    expect(deps.getBlock).toHaveBeenCalledWith(lookbackBlock.number);
    expect(deps.quoteExactInput).toHaveBeenCalledWith({
      tokenIn: "USDt0",
      tokenOut: "USDG",
      amountInAtomic: 25_000_000n,
      block,
    });
    expect(deps.readFullRangeState).toHaveBeenCalledWith({
      block,
      lookbackBlock,
    });
  });

  it("captures one same-block Aave, Curve, and Uniswap route graph", async () => {
    const deps = dependencies();

    const snapshot = await captureRouteSnapshotV2(policy, deps);

    expect(snapshot).toMatchObject({
      version: 2,
      requestId: policy.requestId,
      chainId: 196,
      blockNumber: block.number.toString(),
      blockHash: block.hash,
      capturedAt: "2026-08-11T03:19:58.000Z",
      adapterRegistryHash: registryHash,
      scannedAdapters: ["aave-v3@1", "curve-stableswap-ng@1", "uniswap-v3@1"],
      valuations: [
        { asset: usdg.toLowerCase(), decimals: 6, priceUsdE8: "99999018" },
        { asset: usdt0.toLowerCase(), decimals: 6, priceUsdE8: "99912234" },
      ],
    });
    expect(snapshot.opportunities.filter(
      (opportunity) => opportunity.kind !== "uniswap-v3-full-range-lp",
    )).toEqual([
      {
        id: `aave-v3:${usdg.toLowerCase()}:49401000`,
        kind: "aave-v3-supply",
        adapterId: "aave-v3@1",
        asset: usdg.toLowerCase(),
        supplyRateBps: 40,
        tvlUsdE6: "699993126000",
        availableLiquidityAtomic: "40000000000000",
        validatedSupplyAtomic: "49401000",
      },
      {
        id: `aave-v3:${usdg.toLowerCase()}:49509900`,
        kind: "aave-v3-supply",
        adapterId: "aave-v3@1",
        asset: usdg.toLowerCase(),
        supplyRateBps: 40,
        tvlUsdE6: "699993126000",
        availableLiquidityAtomic: "40000000000000",
        validatedSupplyAtomic: "49509900",
      },
      {
        id: `aave-v3:${usdt0.toLowerCase()}:50000000`,
        kind: "aave-v3-supply",
        adapterId: "aave-v3@1",
        asset: usdt0.toLowerCase(),
        supplyRateBps: 24,
        tvlUsdE6: "51954361680000",
        availableLiquidityAtomic: "40000000000000",
        validatedSupplyAtomic: "50000000",
      },
      {
        id: `curve-stableswap-ng:${usdt0.toLowerCase()}:${usdg.toLowerCase()}:50000000`,
        kind: "curve-stableswap-ng-exact-input",
        adapterId: "curve-stableswap-ng@1",
        pool: PROTOCOL_REGISTRY.curveStableSwapNg.pair.pool.address.toLowerCase(),
        tokenIn: usdt0.toLowerCase(),
        tokenOut: usdg.toLowerCase(),
        inputIndex: 1,
        outputIndex: 0,
        fee: "1000000",
        quotedInputAtomic: "50000000",
        quotedOutputAtomic: "50010000",
      },
      {
        id: `uniswap-v3:${usdt0.toLowerCase()}:${usdg.toLowerCase()}:100:50000000`,
        kind: "uniswap-v3-exact-input",
        adapterId: "uniswap-v3@1",
        tokenIn: usdt0.toLowerCase(),
        tokenOut: usdg.toLowerCase(),
        feeTier: 100,
        quotedInputAtomic: "50000000",
        quotedOutputAtomic: "49900000",
        estimatedGas: "100212",
      },
    ]);
    expect(snapshot.opportunities).toHaveLength(6);
    expect(deps.readReserve).toHaveBeenCalledWith({
      asset: "USDG",
      amountAtomic: 49_401_000n,
      block,
    });
    expect(deps.readReserve).toHaveBeenCalledWith({
      asset: "USDt0",
      amountAtomic: 50_000_000n,
      block,
    });
    expect(Object.isFrozen(snapshot.opportunities)).toBe(true);
    expect(Object.isFrozen(snapshot.valuations)).toBe(true);
    expect(Object.isFrozen(snapshot.valuations[0])).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("records a complete empty scan when every route is deterministically ineligible", async () => {
    const deps = dependencies();
    deps.quoteExactInput.mockRejectedValue(new ProtocolIneligibleError(
      "uniswap-zero-liquidity",
      "No active pool liquidity",
    ));
    deps.quoteCurveExactInput.mockRejectedValue(new ProtocolIneligibleError(
      "curve-zero-liquidity",
      "No active pool liquidity",
    ));
    deps.readReserve.mockRejectedValue(new ProtocolIneligibleError(
      "aave-reserve-paused",
      "Reserve paused",
    ));

    await expect(captureRouteSnapshotV2(policy, deps)).resolves.toMatchObject({
      scannedAdapters: ["aave-v3@1", "curve-stableswap-ng@1", "uniswap-v3@1"],
      opportunities: [],
    });
  });

  it("aborts the entire snapshot on an RPC or authority failure", async () => {
    const deps = dependencies();
    deps.quoteExactInput.mockRejectedValue(new Error("RPC unavailable"));

    await expect(captureRouteSnapshotV2(policy, deps)).rejects.toThrow("RPC unavailable");
    expect(deps.readReserve).not.toHaveBeenCalled();
  });

  it("rejects adapter output from another block or registry", async () => {
    const deps = dependencies();
    deps.quoteExactInput.mockResolvedValue({
      ...uniswapQuote(),
      blockHash: `0x${"ef".repeat(32)}`,
    });

    await expect(captureRouteSnapshotV2(policy, deps)).rejects.toThrow(
      "another snapshot block",
    );

    const wrongRegistry = dependencies();
    wrongRegistry.readOraclePrices.mockResolvedValue({
      ...await wrongRegistry.readOraclePrices(),
      registryHash: `0x${"12".repeat(32)}` as typeof registryHash,
    });
    await expect(captureRouteSnapshotV2(policy, wrongRegistry)).rejects.toThrow(
      "another registry",
    );
  });

  it.each([
    ["token input", { tokenIn: usdg }],
    ["token output", { tokenOut: usdt0 }],
    ["input amount", { amountInAtomic: 49_000_000n }],
    ["pool", { pool: "0x1111111111111111111111111111111111111111" }],
  ] as const)("rejects a quote with another %s", async (_, change) => {
    const deps = dependencies();
    deps.quoteExactInput.mockResolvedValue({
      ...uniswapQuote(),
      ...change,
    });

    await expect(captureRouteSnapshotV2(policy, deps)).rejects.toThrow(
      "does not match the requested route",
    );
  });

  it.each([
    ["aToken", { aToken: PROTOCOL_REGISTRY.aaveV3.assets.USDG.aToken.address }],
    ["decimals", { decimals: 0 }],
    ["validated amount", { validatedSupplyAtomic: 1n }],
  ] as const)("rejects a reserve with wrong %s identity", async (_, change) => {
    const deps = dependencies();
    deps.readReserve.mockImplementation(async (input) => ({
      ...reserve(
        input.asset === "USDG" ? usdg : usdt0,
        24n * 10n ** 23n,
        input.amountAtomic,
      ),
      ...(input.asset === "USDt0" ? change : {}),
    }));

    await expect(captureRouteSnapshotV2(policy, deps)).rejects.toThrow(
      "does not match the registered asset",
    );
  });

  it("rejects another oracle authority before projecting USD valuations", async () => {
    const deps = dependencies();
    deps.readOraclePrices.mockResolvedValue({
      ...await deps.readOraclePrices(),
      oracle: "0x1111111111111111111111111111111111111111",
    });

    await expect(captureRouteSnapshotV2(policy, deps)).rejects.toThrow(
      "another price authority",
    );
  });

  it("floors the exact signed exposure for an odd principal", async () => {
    const deps = dependencies();
    await captureRouteSnapshotV2({ ...policy, principalAtomic: "100000001" }, deps);

    expect(deps.quoteExactInput).toHaveBeenCalledWith(expect.objectContaining({
      amountInAtomic: 50_000_000n,
    }));
    expect(deps.readReserve).toHaveBeenCalledWith(expect.objectContaining({
      asset: "USDt0",
      amountAtomic: 50_000_000n,
    }));
  });

  it("passes an immutable copy of the block anchor to every dependency", async () => {
    const deps = dependencies();
    const mutableBlock = { ...block };
    deps.getLatestBlock.mockResolvedValue(mutableBlock);
    deps.readOraclePrices.mockImplementation(async ({ block: received }) => {
      expect(received).not.toBe(mutableBlock);
      expect(Object.isFrozen(received)).toBe(true);
      expect(() => {
        (received as { hash: string }).hash = `0x${"ef".repeat(32)}`;
      }).toThrow();
      return {
        adapterId: "aave-v3@1" as const,
        registryHash,
        blockNumber: block.number,
        blockHash: block.hash,
        blockTimestamp: block.timestamp,
        oracle: PROTOCOL_REGISTRY.aaveV3.oracle.address,
        baseCurrencyUnit: 100_000_000n as const,
        prices: [
          { asset: usdg, decimals: 6 as const, priceUsdE8: 99_999_018n },
          { asset: usdt0, decimals: 6 as const, priceUsdE8: 99_912_234n },
        ],
      };
    });

    await expect(captureRouteSnapshotV2(policy, deps)).resolves.toMatchObject({
      blockHash: block.hash,
    });
    expect(mutableBlock.hash).toBe(block.hash);
  });
});
