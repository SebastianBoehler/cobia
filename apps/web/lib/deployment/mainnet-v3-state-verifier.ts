import { getAddress, keccak256, type Address, type Hash, type Hex } from "viem";

export interface MainnetV3Limits {
  maxRoute: bigint;
  maxWalletDaily: bigint;
  maxCumulative: bigint;
}

export interface MainnetV3StateSpec {
  chainId: 196;
  owner: Address;
  verifier: Address;
  registry: Address;
  riskManager: Address;
  executor: Address;
  canary: Address;
  activationAtSec: number;
  codeHashes: { riskManager: Hash; executor: Hash };
  tokens: readonly { token: Address; limits: MainnetV3Limits }[];
  permissions: readonly {
    key: Hash; target: Address; runtimeCodeHash: Hash; activateAfterSec: number;
  }[];
}

type ContractField =
  | "owner" | "verifierSigner" | "executor" | "paused" | "accessMode"
  | "pendingVerifier" | "verifierActivateAfter" | "openAccessAfter"
  | "pendingToken" | "tokenEnabled" | "tokenLimits" | "walletAllowAfter"
  | "walletAllowed" | "walletDenied" | "unpauseAfter" | "permissions"
  | "registry" | "riskManager";

export interface MainnetV3StateReader {
  chainId(): Promise<number>;
  latestBlock(): Promise<{ number: bigint; hash: Hash; timestamp: bigint }>;
  blockHash(blockNumber: bigint): Promise<Hash>;
  code(address: Address, blockNumber: bigint): Promise<Hex>;
  contractValue(
    address: Address,
    field: ContractField,
    args: readonly unknown[] | undefined,
    blockNumber: bigint,
  ): Promise<unknown>;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_LIMITS: MainnetV3Limits = { maxRoute: 0n, maxWalletDaily: 0n, maxCumulative: 0n };

function sameAddress(actual: unknown, expected: Address): boolean {
  return typeof actual === "string" && getAddress(actual) === getAddress(expected);
}

function sameHash(actual: unknown, expected: Hash): boolean {
  return typeof actual === "string" && actual.toLowerCase() === expected.toLowerCase();
}

function asBigInt(value: unknown, label: string): bigint {
  if (typeof value !== "bigint") throw new Error(`${label} is malformed`);
  return value;
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} is malformed`);
  return value;
}

function asLimits(value: unknown, label: string): MainnetV3Limits {
  if (!value || typeof value !== "object") throw new Error(`${label} is malformed`);
  const input = value as Record<string, unknown>;
  return {
    maxRoute: asBigInt(input.maxRoute, label),
    maxWalletDaily: asBigInt(input.maxWalletDaily, label),
    maxCumulative: asBigInt(input.maxCumulative, label),
  };
}

function sameLimits(actual: MainnetV3Limits, expected: MainnetV3Limits): boolean {
  return actual.maxRoute === expected.maxRoute &&
    actual.maxWalletDaily === expected.maxWalletDaily &&
    actual.maxCumulative === expected.maxCumulative;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error(`${label} is malformed`);
  return value as Record<string, unknown>;
}

function assertion(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function verifyMainnetV3State(input: {
  spec: MainnetV3StateSpec;
  reader: MainnetV3StateReader;
  mode: "proposed" | "active";
}) {
  const { spec, reader, mode } = input;
  assertion(await reader.chainId() === spec.chainId, "X Layer chain mismatch");
  const block = await reader.latestBlock();
  const read = (address: Address, field: ContractField, args?: readonly unknown[]) =>
    reader.contractValue(address, field, args, block.number);

  assertion(sameAddress(await read(spec.riskManager, "owner"), spec.owner), "risk manager owner mismatch");
  assertion(sameAddress(await read(spec.riskManager, "verifierSigner"), spec.verifier), "verifier mismatch");
  assertion(sameAddress(await read(spec.riskManager, "executor"), spec.executor), "risk manager executor mismatch");
  assertion(sameAddress(await read(spec.executor, "registry"), spec.registry), "executor registry mismatch");
  assertion(sameAddress(await read(spec.executor, "riskManager"), spec.riskManager), "executor risk manager mismatch");
  assertion(Number(await read(spec.riskManager, "accessMode")) === 0, "risk access mode mismatch");
  assertion(sameAddress(await read(spec.riskManager, "pendingVerifier"), ZERO_ADDRESS), "unexpected pending verifier");
  assertion(asBigInt(await read(spec.riskManager, "verifierActivateAfter"), "verifier activation") === 0n,
    "unexpected verifier activation");
  assertion(asBigInt(await read(spec.riskManager, "openAccessAfter"), "open access") === 0n,
    "unexpected open-access activation");

  const expectedPaused = mode === "proposed";
  assertion(asBoolean(await read(spec.riskManager, "paused"), "risk pause") === expectedPaused,
    "risk manager pause mismatch");
  assertion(asBoolean(await read(spec.registry, "paused"), "registry pause") === expectedPaused,
    "registry pause mismatch");

  for (const expected of spec.tokens) {
    const pending = object(await read(spec.riskManager, "pendingToken", [expected.token]), "pending token");
    const pendingLimits = asLimits(pending.limits, "pending token limits");
    const pendingAfter = asBigInt(pending.activateAfter, "pending token activation");
    const current = asLimits(await read(spec.riskManager, "tokenLimits", [expected.token]), "token limits");
    const enabled = asBoolean(await read(spec.riskManager, "tokenEnabled", [expected.token]), "token enabled");
    if (mode === "proposed") {
      assertion(sameLimits(pendingLimits, expected.limits) && pendingAfter === BigInt(spec.activationAtSec),
        "token proposal mismatch");
      assertion(!enabled && sameLimits(current, ZERO_LIMITS), "token activation mismatch");
    } else {
      assertion(sameLimits(pendingLimits, ZERO_LIMITS) && pendingAfter === 0n, "pending token was not cleared");
      assertion(enabled && sameLimits(current, expected.limits), "token activation mismatch");
    }
  }

  const canaryAfter = asBigInt(await read(spec.riskManager, "walletAllowAfter", [spec.canary]), "canary activation");
  const canaryAllowed = asBoolean(await read(spec.riskManager, "walletAllowed", [spec.canary]), "canary allowed");
  const canaryDenied = asBoolean(await read(spec.riskManager, "walletDenied", [spec.canary]), "canary denied");
  assertion(!canaryDenied, "canary is denied");
  assertion(mode === "proposed"
    ? canaryAfter === BigInt(spec.activationAtSec) && !canaryAllowed
    : canaryAfter === 0n && canaryAllowed, "canary proposal mismatch");
  const unpauseAfter = asBigInt(await read(spec.riskManager, "unpauseAfter"), "unpause activation");
  assertion(unpauseAfter === (mode === "proposed" ? BigInt(spec.activationAtSec) : 0n),
    "unpause proposal mismatch");

  for (const expected of spec.permissions) {
    const permission = object(await read(spec.registry, "permissions", [expected.key]), "permission");
    assertion(sameHash(permission.runtimeCodeHash, expected.runtimeCodeHash) &&
      sameAddress(permission.target, expected.target) &&
      asBigInt(permission.activateAfter, "permission activation") === BigInt(expected.activateAfterSec) &&
      asBoolean(permission.active, "permission active") === (mode === "active"), "permission mismatch");
    const code = await reader.code(expected.target, block.number);
    assertion(code !== "0x" && keccak256(code) === expected.runtimeCodeHash, "permission target code hash mismatch");
  }

  const riskCode = await reader.code(spec.riskManager, block.number);
  const executorCode = await reader.code(spec.executor, block.number);
  assertion(riskCode !== "0x" && keccak256(riskCode) === spec.codeHashes.riskManager,
    "risk manager code hash mismatch");
  assertion(executorCode !== "0x" && keccak256(executorCode) === spec.codeHashes.executor,
    "executor code hash mismatch");
  assertion(await reader.blockHash(block.number) === block.hash, "pinned block is not canonical");

  return {
    version: 1 as const,
    mode,
    chainId: spec.chainId,
    blockNumber: block.number.toString(),
    blockHash: block.hash,
    blockTimestamp: block.timestamp.toString(),
    tokenCount: spec.tokens.length,
    permissionCount: spec.permissions.length,
  };
}
