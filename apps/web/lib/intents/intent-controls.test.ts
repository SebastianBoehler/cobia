import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { protocolForbiddenTargets } from "./intent-controls";

describe("intent controls", () => {
  it("turns route exclusions into sorted canonical verifier targets", () => {
    expect(protocolForbiddenTargets(["uniswap-v3", "aave-v3"])).toEqual([
      PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager.address.toLowerCase(),
      PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address.toLowerCase(),
      PROTOCOL_REGISTRY.aaveV3.pool.address.toLowerCase(),
    ].sort());
  });
});
