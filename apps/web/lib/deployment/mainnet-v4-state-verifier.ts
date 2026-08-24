import { getAddress, keccak256, parseAbi, type Address, type Hash, type Hex } from "viem";
import {
  assertPartitionedMigrationBudgetV4,
  type PartitionedMigrationBudgetInputV4,
} from "./v4-migration-budget";

export type V4ReleaseMode = "proposed" | "canary" | "open";
export interface MainnetV4StateSpec {
  chainId: 1 | 196;
  owner: Address;
  verifier: Address;
  registry: Address;
  riskManager: Address;
  executor: Address;
  canary: Address;
  activationAtSec: number;
  openAccessAfterSec: number;
  codeHashes: { riskManager: Hash; executor: Hash };
  permissions: readonly { key: Hash; target: Address; runtimeCodeHash: Hash }[];
  migration?: PartitionedMigrationBudgetInputV4 & { v3RiskManager?: Address };
}
type Field = "owner" | "verifierSigner" | "executor" | "registry" | "riskManager" | "limits" |
  "pendingLimits" | "pendingVerifier" | "verifierActivateAfter" | "paused" | "accessMode" |
  "walletAllowAfter" | "walletAllowed" | "walletDenied" | "unpauseAfter" | "openAccessAfter" |
  "permissions" | "tokenLimits" | "cumulativeInput";
export interface MainnetV4StateReader {
  chainId(): Promise<number>;
  latestBlock(): Promise<{ number: bigint; hash: Hash; timestamp: bigint }>;
  blockHash(blockNumber: bigint): Promise<Hash>;
  codeHash(address: Address, blockNumber: bigint): Promise<Hash>;
  contractValue(address: Address, field: Field, args: readonly unknown[] | undefined,
    blockNumber: bigint): Promise<unknown>;
}

const READ_ABI = parseAbi([
  "function owner() view returns (address)",
  "function verifierSigner() view returns (address)",
  "function executor() view returns (address)",
  "function registry() view returns (address)",
  "function riskManager() view returns (address)",
  "function limits() view returns (uint128 maxRouteUsdE8,uint128 maxWallet24hUsdE8,uint128 maxProtocol24hUsdE8)",
  "function pendingLimits() view returns ((uint128 maxRouteUsdE8,uint128 maxWallet24hUsdE8,uint128 maxProtocol24hUsdE8) values,uint64 activateAfter)",
  "function pendingVerifier() view returns (address)",
  "function verifierActivateAfter() view returns (uint64)",
  "function paused() view returns (bool)",
  "function accessMode() view returns (uint8)",
  "function walletAllowAfter(address wallet) view returns (uint64)",
  "function walletAllowed(address wallet) view returns (bool)",
  "function walletDenied(address wallet) view returns (bool)",
  "function unpauseAfter() view returns (uint64)",
  "function openAccessAfter() view returns (uint64)",
  "function permissions(bytes32 key) view returns (bytes32 runtimeCodeHash,address target,uint64 activateAfter,bool active)",
  "function tokenLimits(address token) view returns (uint128 maxRoute,uint128 maxWalletDaily,uint128 maxCumulative)",
  "function cumulativeInput(address token) view returns (uint256)",
]);

interface V4PublicClient {
  getChainId(): Promise<number>;
  getBlock(input: { blockTag?: "latest"; blockNumber?: bigint }): Promise<{
    number?: bigint; hash: Hash | null; timestamp?: bigint;
  }>;
  getCode(input: { address: Address; blockNumber: bigint }): Promise<Hex | undefined>;
  readContract(input: { address: Address; abi: typeof READ_ABI; functionName: string;
    args: readonly unknown[]; blockNumber: bigint }): Promise<unknown>;
}

function tuple(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} returned a malformed tuple`);
  return value;
}
function normalizedLimits(value: unknown) {
  if (!Array.isArray(value)) return value;
  return { maxRouteUsdE8: value[0], maxWallet24hUsdE8: value[1], maxProtocol24hUsdE8: value[2] };
}
function normalizedField(field: Field, value: unknown) {
  if (field === "limits") return normalizedLimits(value);
  if (field === "pendingLimits") {
    const result = tuple(value, field);
    return { values: normalizedLimits(result[0]), activateAfter: result[1] };
  }
  if (field === "permissions") {
    const result = tuple(value, field);
    return { runtimeCodeHash: result[0], target: result[1], activateAfter: result[2], active: result[3] };
  }
  if (field === "tokenLimits") {
    const result = tuple(value, field);
    return { maxRoute: result[0], maxWalletDaily: result[1], maxCumulative: result[2] };
  }
  return value;
}

export function createMainnetV4StateReader(client: V4PublicClient): MainnetV4StateReader {
  return {
    chainId: () => client.getChainId(),
    async latestBlock() {
      const block = await client.getBlock({ blockTag: "latest" });
      if (block.number === undefined || block.hash === null || block.timestamp === undefined) {
        throw new Error("Latest V4 chain block is incomplete");
      }
      return { number: block.number, hash: block.hash, timestamp: block.timestamp };
    },
    async blockHash(blockNumber) {
      const block = await client.getBlock({ blockNumber });
      if (!block.hash) throw new Error("Pinned V4 chain block is unavailable");
      return block.hash;
    },
    async codeHash(target, blockNumber) {
      const code = await client.getCode({ address: target, blockNumber });
      if (!code || code === "0x") throw new Error("Expected V4 runtime code is unavailable");
      return keccak256(code);
    },
    async contractValue(target, field, args = [], blockNumber) {
      const value = await client.readContract({ address: target, abi: READ_ABI,
        functionName: field, args, blockNumber });
      return normalizedField(field, value);
    },
  };
}

const ZERO = "0x0000000000000000000000000000000000000000";
const contractLimits = { maxRouteUsdE8: 100_000_000_000n,
  maxWallet24hUsdE8: 500_000_000_000n, maxProtocol24hUsdE8: 5_000_000_000_000n };
function fail(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function object(value: unknown, label: string): Record<string, unknown> {
  fail(Boolean(value) && typeof value === "object", `${label} is malformed`);
  return value as Record<string, unknown>;
}
function bigint(value: unknown, label: string): bigint {
  fail(typeof value === "bigint", `${label} is malformed`); return value;
}
function bool(value: unknown, label: string): boolean {
  fail(typeof value === "boolean", `${label} is malformed`); return value;
}
const address = (value: unknown, expected: Address) =>
  typeof value === "string" && getAddress(value) === getAddress(expected);
const sameHash = (value: unknown, expected: Hash) =>
  typeof value === "string" && value.toLowerCase() === expected.toLowerCase();
function limits(value: unknown) {
  const result = object(value, "limits");
  return { maxRouteUsdE8: bigint(result.maxRouteUsdE8, "route limit"),
    maxWallet24hUsdE8: bigint(result.maxWallet24hUsdE8, "wallet limit"),
    maxProtocol24hUsdE8: bigint(result.maxProtocol24hUsdE8, "protocol limit") };
}
type NormalizedLimits = ReturnType<typeof limits>;
const sameLimits = (left: NormalizedLimits, right: NormalizedLimits) =>
  left.maxRouteUsdE8 === right.maxRouteUsdE8 && left.maxWallet24hUsdE8 === right.maxWallet24hUsdE8 &&
  left.maxProtocol24hUsdE8 === right.maxProtocol24hUsdE8;

export async function verifyMainnetV4State(input: {
  spec: MainnetV4StateSpec; reader: MainnetV4StateReader; mode: V4ReleaseMode;
}) {
  const { spec, reader, mode } = input;
  fail(await reader.chainId() === spec.chainId, "V4 chain mismatch");
  const block = await reader.latestBlock();
  const read = (target: Address, field: Field, args?: readonly unknown[]) =>
    reader.contractValue(target, field, args, block.number);
  fail(address(await read(spec.riskManager, "owner"), spec.owner), "risk owner mismatch");
  fail(address(await read(spec.registry, "owner"), spec.owner), "registry owner mismatch");
  fail(address(await read(spec.riskManager, "verifierSigner"), spec.verifier), "verifier mismatch");
  fail(address(await read(spec.riskManager, "executor"), spec.executor), "risk executor mismatch");
  fail(address(await read(spec.executor, "registry"), spec.registry), "executor registry mismatch");
  fail(address(await read(spec.executor, "riskManager"), spec.riskManager), "executor risk mismatch");
  const activeLimits = limits(await read(spec.riskManager, "limits"));
  const expectedLimits = spec.migration
    ? { ...contractLimits, maxProtocol24hUsdE8: BigInt(spec.migration.v4ProtocolCapUsdE8) }
    : contractLimits;
  fail(sameLimits(activeLimits, expectedLimits), "V4 limits mismatch");
  const pending = object(await read(spec.riskManager, "pendingLimits"), "pending limits");
  const zeroLimits = { maxRouteUsdE8: 0n, maxWallet24hUsdE8: 0n, maxProtocol24hUsdE8: 0n };
  fail(sameLimits(limits(pending.values), zeroLimits) && bigint(pending.activateAfter, "limit activation") === 0n,
    "unexpected pending limits");
  fail(address(await read(spec.riskManager, "pendingVerifier"), ZERO), "unexpected pending verifier");
  fail(bigint(await read(spec.riskManager, "verifierActivateAfter"), "verifier activation") === 0n,
    "unexpected verifier activation");
  fail(bool(await read(spec.riskManager, "paused"), "pause") === (mode === "proposed"), "pause mismatch");
  fail(Number(await read(spec.riskManager, "accessMode")) === (mode === "open" ? 1 : 0), "access mode mismatch");
  fail(bigint(await read(spec.riskManager, "walletAllowAfter", [spec.canary]), "wallet activation") ===
    (mode === "proposed" ? BigInt(spec.activationAtSec) : 0n), "canary activation mismatch");
  fail(bool(await read(spec.riskManager, "walletAllowed", [spec.canary]), "wallet allowed") ===
    (mode !== "proposed"), "canary allowance mismatch");
  fail(!bool(await read(spec.riskManager, "walletDenied", [spec.canary]), "wallet denied"), "canary denied");
  fail(bigint(await read(spec.riskManager, "unpauseAfter"), "unpause") ===
    (mode === "proposed" ? BigInt(spec.activationAtSec) : 0n), "unpause mismatch");
  fail(bigint(await read(spec.riskManager, "openAccessAfter"), "open access") === 0n,
    "unexpected pending open access");
  for (const expected of spec.permissions) {
    const permission = object(await read(spec.registry, "permissions", [expected.key]), "permission");
    fail(sameHash(permission.runtimeCodeHash, expected.runtimeCodeHash) &&
      address(permission.target, expected.target) &&
      bigint(permission.activateAfter, "permission activation") === BigInt(spec.activationAtSec) &&
      bool(permission.active, "permission active") === (mode !== "proposed"), "permission mismatch");
    fail(sameHash(await reader.codeHash(expected.target, block.number), expected.runtimeCodeHash),
      "permission target code hash mismatch");
  }
  let migration;
  if (spec.migration) {
    const migrationSpec = spec.migration;
    fail(migrationSpec.chainId === spec.chainId, "migration chain mismatch");
    const v3Assets = await Promise.all(migrationSpec.v3Assets.map(async (asset) => {
      fail(Boolean(migrationSpec.v3RiskManager), "V3 risk manager is missing");
      const tokenLimits = object(await read(migrationSpec.v3RiskManager!, "tokenLimits", [asset.token]),
        "V3 token limits");
      const maximum = bigint(tokenLimits.maxCumulative, "V3 cumulative cap");
      const consumed = bigint(await read(migrationSpec.v3RiskManager!, "cumulativeInput", [asset.token]),
        "V3 cumulative usage");
      fail(maximum >= consumed, "V3 cumulative usage exceeds its cap");
      const remaining = maximum - consumed;
      fail(remaining.toString() === asset.maximumRemainingAtomic, "V3 remaining cap mismatch");
      return { ...asset, maximumRemainingAtomic: remaining.toString() };
    }));
    migration = assertPartitionedMigrationBudgetV4({ ...migrationSpec,
      v4ProtocolCapUsdE8: activeLimits.maxProtocol24hUsdE8.toString(), v3Assets });
  }
  fail(sameHash(await reader.codeHash(spec.riskManager, block.number), spec.codeHashes.riskManager),
    "risk manager code hash mismatch");
  fail(sameHash(await reader.codeHash(spec.executor, block.number), spec.codeHashes.executor),
    "executor code hash mismatch");
  fail(await reader.blockHash(block.number) === block.hash, "pinned block is not canonical");
  return { version: 4 as const, mode, chainId: spec.chainId, blockNumber: block.number.toString(),
    blockHash: block.hash, blockTimestamp: block.timestamp.toString(), permissionCount: spec.permissions.length,
    migration };
}
