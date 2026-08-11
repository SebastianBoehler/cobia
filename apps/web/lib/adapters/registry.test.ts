import { describe, expect, it } from "vitest";
import { ADDRESSES } from "./reader.test-fixture";
import { PROTOCOL_REGISTRY, registryHash } from "./registry";

describe("X Layer protocol registry", () => {
  it("commits the audited Aave, Curve, and Uniswap deployment manifest", () => {
    expect(registryHash).toBe(
      "0xda032b6bb7d76dfbadbb438cc5a4f3061f7b17b33b0fb7769dcefb84b90308ad",
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
      curveFactory: PROTOCOL_REGISTRY.curveStableSwapNg.factory.address,
      curveViews: PROTOCOL_REGISTRY.curveStableSwapNg.views.address,
      curvePlainImplementation: PROTOCOL_REGISTRY.curveStableSwapNg.plainImplementation.address,
      curvePool: PROTOCOL_REGISTRY.curveStableSwapNg.pair.pool.address,
      uniFactory: PROTOCOL_REGISTRY.uniswapV3.factory.address,
      uniQuoter: PROTOCOL_REGISTRY.uniswapV3.quoterV2.address,
      uniRouter: PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address,
      uniPositionManager: PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager.address,
      uniPool: PROTOCOL_REGISTRY.uniswapV3.pair.pool.address,
      fee: PROTOCOL_REGISTRY.uniswapV3.pair.fee,
      aaveAdapter: PROTOCOL_REGISTRY.aaveV3.adapterId,
      curveAdapter: PROTOCOL_REGISTRY.curveStableSwapNg.adapterId,
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
      curveAdapter: "curve-stableswap-ng@1",
      uniswapAdapter: "uniswap-v3@1",
    });
  });
});
