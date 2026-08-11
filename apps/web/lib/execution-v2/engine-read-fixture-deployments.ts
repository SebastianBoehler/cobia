import type { Address, Hash, Hex } from "viem";
import { PROTOCOL_REGISTRY, type PinnedDeployment } from "../adapters/registry";

export function executionFixtureKey(
  address: Address,
  name: string,
  args: readonly unknown[],
  block: bigint,
) {
  return `${address.toLowerCase()}:${name}:${JSON.stringify(args, (_, value) => {
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)) {
      return value.toLowerCase();
    }
    return value;
  })}:${block}`;
}

function addDeployment(
  code: Map<string, Hash>,
  slots: Map<string, Hex>,
  deployment: PinnedDeployment,
) {
  code.set(deployment.address.toLowerCase(), deployment.runtimeCodeHash);
  if (!deployment.implementation) return;
  code.set(
    deployment.implementation.address.toLowerCase(),
    deployment.implementation.runtimeCodeHash,
  );
  slots.set(
    deployment.address.toLowerCase(),
    `0x${"0".repeat(24)}${deployment.implementation.address.slice(2).toLowerCase()}`,
  );
}

export function seedExecutionFixtureDeployments(
  code: Map<string, Hash>,
  slots: Map<string, Hex>,
) {
  const uniswap = PROTOCOL_REGISTRY.uniswapV3;
  const curve = PROTOCOL_REGISTRY.curveStableSwapNg;
  addDeployment(code, slots, PROTOCOL_REGISTRY.aaveV3.pool);
  addDeployment(code, slots, curve.pair.pool);
  addDeployment(code, slots, curve.plainImplementation);
  addDeployment(code, slots, uniswap.swapRouter02);
  addDeployment(code, slots, uniswap.pair.pool);
  addDeployment(code, slots, uniswap.nonfungiblePositionManager);
  for (const asset of Object.values(PROTOCOL_REGISTRY.aaveV3.assets)) {
    addDeployment(code, slots, asset.underlying);
    addDeployment(code, slots, asset.aToken);
  }
}
