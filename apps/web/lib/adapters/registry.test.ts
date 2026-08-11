import { describe, expect, it } from "vitest";
import { ADDRESSES } from "./reader.test-fixture";
import { PROTOCOL_REGISTRY, registryHash } from "./registry";

describe("X Layer protocol registry", () => {
  it("commits the audited Aave and Uniswap deployment manifest", () => {
    expect(registryHash).toBe(
      "0xa0c0ffbb2881447b778ddaabcfc1e3bfd93c42a9f591448cc289a6e316f9fc92",
    );
    expect({
      chainId: PROTOCOL_REGISTRY.chainId,
      auditBlock: PROTOCOL_REGISTRY.auditedAtBlock,
      aaveProvider: PROTOCOL_REGISTRY.aaveV3.addressesProvider.address,
      aavePool: PROTOCOL_REGISTRY.aaveV3.pool.address,
      aavePoolImpl: PROTOCOL_REGISTRY.aaveV3.pool.implementation.address,
      aaveDataProvider: PROTOCOL_REGISTRY.aaveV3.dataProvider.address,
      aaveOracle: PROTOCOL_REGISTRY.aaveV3.oracle.address,
      usdg: PROTOCOL_REGISTRY.aaveV3.assets.USDG.underlying.address,
      usdgImpl: PROTOCOL_REGISTRY.aaveV3.assets.USDG.underlying.implementation.address,
      aUsdg: PROTOCOL_REGISTRY.aaveV3.assets.USDG.aToken.address,
      aTokenImpl: PROTOCOL_REGISTRY.aaveV3.assets.USDG.aToken.implementation.address,
      usdt0: PROTOCOL_REGISTRY.aaveV3.assets.USDt0.underlying.address,
      usdt0Impl: PROTOCOL_REGISTRY.aaveV3.assets.USDt0.underlying.implementation.address,
      aUsdt0: PROTOCOL_REGISTRY.aaveV3.assets.USDt0.aToken.address,
      uniFactory: PROTOCOL_REGISTRY.uniswapV3.factory.address,
      uniQuoter: PROTOCOL_REGISTRY.uniswapV3.quoterV2.address,
      uniRouter: PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address,
      uniPool: PROTOCOL_REGISTRY.uniswapV3.pair.pool.address,
      fee: PROTOCOL_REGISTRY.uniswapV3.pair.fee,
      aaveAdapter: PROTOCOL_REGISTRY.aaveV3.adapterId,
      uniswapAdapter: PROTOCOL_REGISTRY.uniswapV3.adapterId,
    }).toEqual({
      chainId: 196,
      auditBlock: {
        number: "67649362",
        hash: "0x389aab5c989acb3e633dbf96f8fab038757bee9919142ba983d4bd195eb64b5a",
        timestamp: "1786418398",
      },
      ...ADDRESSES,
      fee: 100,
      aaveAdapter: "aave-v3@1",
      uniswapAdapter: "uniswap-v3@1",
    });
  });
});
