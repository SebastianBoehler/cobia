import { createPublicClient, getAddress, http, keccak256, type Address, type Hash } from "viem";
import { xLayerTestnet } from "../chain/xlayer-testnet";

const STATE_ABI = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "executor", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "verifierSigner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "registry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "riskManager", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

interface DeploymentContract {
  address: Address;
  runtimeCodeHash: Hash;
}

export const TESTNET_DEPLOYMENT: {
  owner: Address;
  verifier: Address;
  registry: DeploymentContract;
  riskManager: DeploymentContract;
  executor: DeploymentContract;
} = {
  owner: "0xB6da8E6d497bd3Bc5016416DA57d177085449124",
  verifier: "0x1667d3e9a37655600eb4ee56BD2F5BAddC49fed4",
  registry: {
    address: "0xb0B2bd226b07cD2b83DB51306f12aa29a8Cbd1a5",
    runtimeCodeHash: "0x5de8b09ab2d521591020ccacace3eb18b42900ce7e300cf4aa31e634af14416d",
  },
  riskManager: {
    address: "0xEf955cC592346e3b4cb8c7a67f3FE6B2c4688877",
    runtimeCodeHash: "0xc1797561f6b425e5ffcfcc92115b30b85be68ea5f0484d968d03261743867137",
  },
  executor: {
    address: "0x4029dD2e07f7951e52Fa67E64573B0e5DB3225ab",
    runtimeCodeHash: "0x8fa3b48a0db878b56da8fd71a61e4a83f262c3e7d619f5eed5d48de6addd7083",
  },
};

function sameAddress(actual: unknown, expected: Address): boolean {
  return typeof actual === "string" && getAddress(actual) === expected;
}

export async function readTestnetDeploymentStatus(rpcUrl?: string) {
  const endpoint = rpcUrl ?? process.env.XLAYER_TESTNET_RPC_URL ?? xLayerTestnet.rpcUrls.default.http[0];
  const client = createPublicClient({
    chain: xLayerTestnet,
    transport: http(endpoint, { timeout: 10_000 }),
  });
  if (await client.getChainId() !== 1952) throw new Error("Testnet RPC chain mismatch");
  const blockNumber = await client.getBlockNumber();
  const entries = Object.entries({
    registry: TESTNET_DEPLOYMENT.registry,
    riskManager: TESTNET_DEPLOYMENT.riskManager,
    executor: TESTNET_DEPLOYMENT.executor,
  }) as Array<["registry" | "riskManager" | "executor", DeploymentContract]>;
  const code = await Promise.all(entries.map(async ([label, contract]) => {
    const runtime = await client.getCode({ address: contract.address, blockNumber });
    if (!runtime || keccak256(runtime) !== contract.runtimeCodeHash) {
      throw new Error(`${label === "riskManager" ? "Risk manager" : `${label[0].toUpperCase()}${label.slice(1)}`} runtime code mismatch`);
    }
    return [label, { address: contract.address, runtimeCodeHash: contract.runtimeCodeHash, verified: true }] as const;
  }));
  const read = (address: Address, functionName: typeof STATE_ABI[number]["name"]) => client.readContract({
    address,
    abi: STATE_ABI,
    functionName,
    blockNumber,
  });
  const [registryOwner, registryPaused, riskOwner, riskPaused, executor, verifier, registry, riskManager] = await Promise.all([
    read(TESTNET_DEPLOYMENT.registry.address, "owner"),
    read(TESTNET_DEPLOYMENT.registry.address, "paused"),
    read(TESTNET_DEPLOYMENT.riskManager.address, "owner"),
    read(TESTNET_DEPLOYMENT.riskManager.address, "paused"),
    read(TESTNET_DEPLOYMENT.riskManager.address, "executor"),
    read(TESTNET_DEPLOYMENT.riskManager.address, "verifierSigner"),
    read(TESTNET_DEPLOYMENT.executor.address, "registry"),
    read(TESTNET_DEPLOYMENT.executor.address, "riskManager"),
  ]);
  if (registryPaused !== true || riskPaused !== true) throw new Error("Testnet deployment is not paused");
  if (!sameAddress(registryOwner, TESTNET_DEPLOYMENT.owner) || !sameAddress(riskOwner, TESTNET_DEPLOYMENT.owner) ||
    !sameAddress(executor, TESTNET_DEPLOYMENT.executor.address) || !sameAddress(verifier, TESTNET_DEPLOYMENT.verifier) ||
    !sameAddress(registry, TESTNET_DEPLOYMENT.registry.address) || !sameAddress(riskManager, TESTNET_DEPLOYMENT.riskManager.address)) {
    throw new Error("Testnet deployment binding mismatch");
  }
  return {
    chainId: 1952 as const,
    networkName: "X Layer Testnet" as const,
    blockNumber: blockNumber.toString(),
    observedAt: new Date().toISOString(),
    state: "paused" as const,
    contracts: Object.fromEntries(code),
  };
}
