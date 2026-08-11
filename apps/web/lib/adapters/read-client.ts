import {
  getAddress,
  isAddress,
  isAddressEqual,
  keccak256,
  type Abi,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
} from "viem";
import type { PinnedDeployment } from "./registry";

export const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

export interface BlockReference {
  readonly number: bigint;
  readonly hash: Hash;
  readonly timestamp: bigint;
}

export interface ProtocolReadClient {
  getChainId(): Promise<number>;
  getBlock(request: { blockNumber: bigint }): Promise<{
    number: bigint;
    hash: Hash | null;
    timestamp: bigint;
  }>;
  getStorageAt(request: {
    address: Address;
    slot: Hex;
    blockNumber: bigint;
  }): Promise<Hex | undefined>;
  getRuntimeCodeHash(request: {
    address: Address;
    blockNumber: bigint;
  }): Promise<Hash | undefined>;
  readContract(request: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    blockNumber: bigint;
  }): Promise<unknown>;
}

export function createProtocolReadClient(
  client: Pick<
    PublicClient,
    "getBlock" | "getChainId" | "getCode" | "getStorageAt" | "readContract"
  >,
): ProtocolReadClient {
  return {
    getChainId: () => client.getChainId(),
    async getBlock(request) {
      const block = await client.getBlock(request);
      return { number: block.number, hash: block.hash, timestamp: block.timestamp };
    },
    getStorageAt: (request) => client.getStorageAt(request),
    async getRuntimeCodeHash(request) {
      const code = await client.getCode(request);
      return !code || code === "0x" ? undefined : keccak256(code);
    },
    readContract: (request) => client.readContract(request as never) as Promise<unknown>,
  };
}

export async function assertChainId(client: ProtocolReadClient, expectedChainId: number) {
  if (await client.getChainId() !== expectedChainId) {
    throw new Error(`Reader must be connected to X Layer chain ${expectedChainId}`);
  }
}

export async function assertPinnedBlock(
  client: ProtocolReadClient,
  expected: BlockReference,
) {
  const actual = await client.getBlock({ blockNumber: expected.number });
  if (actual.number !== expected.number) throw new Error("Pinned block number changed");
  if (actual.hash !== expected.hash) throw new Error("Pinned block hash changed");
  if (actual.timestamp !== expected.timestamp) throw new Error("Pinned block timestamp changed");
}

function implementationAddress(storage: Hex | undefined, label: string): Address {
  if (!storage || storage.length !== 66) {
    throw new Error(`${label} implementation slot is malformed`);
  }
  const address = getAddress(`0x${storage.slice(-40)}`);
  if (address === "0x0000000000000000000000000000000000000000") {
    throw new Error(`${label} implementation slot is empty`);
  }
  return address;
}

export async function assertRuntimeCode(
  client: ProtocolReadClient,
  deployment: PinnedDeployment,
  label: string,
  blockNumber: bigint,
) {
  const codeHash = await client.getRuntimeCodeHash({
    address: deployment.address,
    blockNumber,
  });
  if (codeHash !== deployment.runtimeCodeHash) {
    throw new Error(`${label} runtime code hash mismatch`);
  }
  if (!deployment.implementation) return;
  const storage = await client.getStorageAt({
    address: deployment.address,
    slot: EIP1967_IMPLEMENTATION_SLOT,
    blockNumber,
  });
  const actualImplementation = implementationAddress(storage, label);
  if (!isAddressEqual(actualImplementation, deployment.implementation.address)) {
    throw new Error(`${label} implementation identity mismatch`);
  }
  const implementationHash = await client.getRuntimeCodeHash({
    address: deployment.implementation.address,
    blockNumber,
  });
  if (implementationHash !== deployment.implementation.runtimeCodeHash) {
    throw new Error(`${label} implementation runtime code hash mismatch`);
  }
}

export function expectTuple(value: unknown, length: number, label: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(`${label} returned malformed data`);
  }
  return value;
}

export function expectAddress(value: unknown, label: string): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    throw new Error(`${label} returned malformed address`);
  }
  return value;
}

export function expectBigInt(value: unknown, label: string): bigint {
  if (typeof value !== "bigint") throw new Error(`${label} returned malformed integer`);
  return value;
}

export function expectNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${label} returned malformed number`);
  }
  return value;
}

export function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} returned malformed boolean`);
  return value;
}
