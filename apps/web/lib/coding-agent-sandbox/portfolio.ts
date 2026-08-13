import { erc20Abi, getAddress, type Address, type Hash } from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";

export interface CapabilityPortfolioReadV1 {
  getChainId(): Promise<number>;
  getBlock(number: bigint): Promise<{ hash?: Hash }>;
  balanceOf(token: Address, owner: Address, blockNumber: bigint): Promise<bigint>;
  allowance(
    token: Address,
    owner: Address,
    spender: Address,
    blockNumber: bigint,
  ): Promise<bigint>;
}

export function createCapabilityPortfolioReadV1(input: {
  client: {
    getChainId(): Promise<number>;
    getBlock(input: { blockNumber: bigint }): Promise<{ hash: Hash | null }>;
    readContract(input: {
      address: Address;
      abi: typeof erc20Abi;
      functionName: "balanceOf" | "allowance";
      args: readonly Address[];
      blockNumber: bigint;
    }): Promise<unknown>;
  };
}): CapabilityPortfolioReadV1 {
  return {
    getChainId: () => input.client.getChainId(),
    getBlock: (blockNumber) => input.client.getBlock({ blockNumber }).then(({ hash }) => ({
      ...(hash ? { hash } : {}),
    })),
    balanceOf: async (token, owner, blockNumber) => BigInt(await input.client.readContract({
      address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner], blockNumber,
    }) as bigint),
    allowance: async (token, owner, spender, blockNumber) => BigInt(await input.client.readContract({
      address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender], blockNumber,
    }) as bigint),
  };
}

export async function captureCapabilityPortfolioV1(input: {
  owner: Address;
  executor: Address;
  block: { number: string; hash: Hash };
  read: CapabilityPortfolioReadV1;
}) {
  if (await input.read.getChainId() !== 196) throw new Error("Portfolio RPC chain is not X Layer mainnet");
  const blockNumber = BigInt(input.block.number);
  const observed = await input.read.getBlock(blockNumber);
  if (!observed.hash || observed.hash.toLowerCase() !== input.block.hash.toLowerCase()) {
    throw new Error("Portfolio RPC block does not match the pinned anchor");
  }
  const assets = Object.entries(PROTOCOL_REGISTRY.aaveV3.assets).sort(([left], [right]) =>
    left.localeCompare(right));
  const records = await Promise.all(assets.map(async ([symbol, asset]) => {
    const [balance, allowance, position] = await Promise.all([
      input.read.balanceOf(asset.underlying.address, input.owner, blockNumber),
      input.read.allowance(asset.underlying.address, input.owner, input.executor, blockNumber),
      input.read.balanceOf(asset.aToken.address, input.owner, blockNumber),
    ]);
    return { symbol, asset, balance, allowance, position };
  }));
  return {
    balances: records.map(({ symbol, asset, balance }) => ({
      token: getAddress(asset.underlying.address), symbol, atomic: balance.toString(),
    })),
    allowances: records.map(({ asset, allowance }) => ({
      token: getAddress(asset.underlying.address),
      owner: getAddress(input.owner),
      spender: getAddress(input.executor),
      atomic: allowance.toString(),
    })),
    positions: records.map(({ symbol, asset, position }) => ({
      adapterId: PROTOCOL_REGISTRY.aaveV3.adapterId,
      receiptToken: getAddress(asset.aToken.address),
      underlyingToken: getAddress(asset.underlying.address),
      symbol: `a${symbol}`,
      atomic: position.toString(),
      owner: getAddress(input.owner),
    })),
  };
}
