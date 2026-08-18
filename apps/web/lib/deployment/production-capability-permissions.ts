import { toFunctionSelector } from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { capabilityPermissionKey } from "./agent-executor-plan";

export function productionCapabilityPermissionKeys() {
  const registry = PROTOCOL_REGISTRY;
  return [{
    id: "aave-v3.supply",
    version: 1,
    target: registry.aaveV3.pool.address,
    selector: toFunctionSelector("supply(address,uint256,address,uint16)"),
    runtimeCodeHash: registry.aaveV3.pool.runtimeCodeHash,
  }, {
    id: "curve-stableswap-ng.exact-input",
    version: 1,
    target: registry.curveStableSwapNg.pair.pool.address,
    selector: toFunctionSelector("exchange(int128,int128,uint256,uint256,address)"),
    runtimeCodeHash: registry.curveStableSwapNg.pair.pool.runtimeCodeHash,
  }, {
    id: "uniswap-v3.exact-input",
    version: 1,
    target: registry.uniswapV3.swapRouter02.address,
    selector: toFunctionSelector("exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))"),
    runtimeCodeHash: registry.uniswapV3.swapRouter02.runtimeCodeHash,
  }].map(capabilityPermissionKey);
}
