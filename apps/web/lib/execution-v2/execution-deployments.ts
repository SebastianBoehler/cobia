import { isAddressEqual, type Hash } from "viem";
import { assertRuntimeCode } from "../adapters/read-client";
import { PROTOCOL_REGISTRY, type PinnedDeployment } from "../adapters/registry";
import { describeExecutionTransactionV2 } from "./transaction-descriptor";
import type { ExecutionReadClientV2 } from "./engine-types";
import type { OwnerTransactionV2 } from "./types";

function assetDeployment(address: `0x${string}`) {
  const entry = Object.values(PROTOCOL_REGISTRY.aaveV3.assets).find((asset) =>
    isAddressEqual(asset.underlying.address, address));
  if (!entry) throw new Error("Execution asset deployment is not registered");
  return entry;
}

async function pin(
  client: ExecutionReadClientV2,
  deployment: PinnedDeployment,
  label: string,
  blockNumber: bigint,
) {
  await assertRuntimeCode(client, deployment, label, blockNumber);
}

export async function assertExecutionDeploymentsV2(
  client: ExecutionReadClientV2,
  transaction: OwnerTransactionV2,
  blockNumber: bigint,
): Promise<Hash> {
  const block = await client.getBlock({ blockNumber });
  if (block.number !== blockNumber || !block.hash) {
    throw new Error("Execution preflight block is unavailable");
  }
  const descriptor = describeExecutionTransactionV2(transaction);
  if (descriptor.kind === "allowance") {
    const asset = assetDeployment(descriptor.token);
    await pin(client, asset.underlying, "approval asset", blockNumber);
    if (isAddressEqual(descriptor.spender, PROTOCOL_REGISTRY.aaveV3.pool.address)) {
      await pin(client, PROTOCOL_REGISTRY.aaveV3.pool, "Aave Pool", blockNumber);
    } else if (isAddressEqual(
      descriptor.spender,
      PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address,
    )) {
      await pin(
        client,
        PROTOCOL_REGISTRY.uniswapV3.swapRouter02,
        "Uniswap SwapRouter02",
        blockNumber,
      );
    } else {
      await pin(
        client,
        PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager,
        "Uniswap NonfungiblePositionManager",
        blockNumber,
      );
    }
    return block.hash;
  }
  if (descriptor.kind === "swap") {
    await Promise.all([
      pin(client, assetDeployment(descriptor.tokenIn).underlying, "swap input", blockNumber),
      pin(client, assetDeployment(descriptor.tokenOut).underlying, "swap output", blockNumber),
      pin(client, PROTOCOL_REGISTRY.uniswapV3.swapRouter02, "Uniswap SwapRouter02", blockNumber),
      pin(client, PROTOCOL_REGISTRY.uniswapV3.pair.pool, "Uniswap pool", blockNumber),
    ]);
    return block.hash;
  }
  if (descriptor.kind === "uniswap-lp-mint") {
    await Promise.all([
      pin(client, assetDeployment(descriptor.token0).underlying, "LP token0", blockNumber),
      pin(client, assetDeployment(descriptor.token1).underlying, "LP token1", blockNumber),
      pin(
        client,
        PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager,
        "Uniswap NonfungiblePositionManager",
        blockNumber,
      ),
      pin(client, PROTOCOL_REGISTRY.uniswapV3.pair.pool, "Uniswap pool", blockNumber),
    ]);
    return block.hash;
  }
  const asset = assetDeployment(descriptor.asset);
  await Promise.all([
    pin(client, PROTOCOL_REGISTRY.aaveV3.pool, "Aave Pool", blockNumber),
    pin(client, asset.underlying, "Aave supply asset", blockNumber),
    pin(client, asset.aToken, "Aave aToken", blockNumber),
  ]);
  return block.hash;
}

export async function assertExecutionBlockHashV2(
  client: ExecutionReadClientV2,
  blockNumber: bigint,
  expectedHash: Hash,
): Promise<void> {
  const block = await client.getBlock({ blockNumber });
  if (block.number !== blockNumber || !block.hash ||
    block.hash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error("Execution preflight block changed before broadcast");
  }
}
