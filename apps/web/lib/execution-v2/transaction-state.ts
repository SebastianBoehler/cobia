import { isAddressEqual, type Address } from "viem";
import { rayDivFloor, rayMulFloor } from "../adapters/aave-math";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import {
  AAVE_EXECUTION_STATE_ABI,
  A_TOKEN_EXECUTION_STATE_ABI,
  ERC20_STATE_ABI,
} from "./abis";
import { describeExecutionTransactionV2 } from "./transaction-descriptor";
import type {
  CapturedExecutionStateV2,
  ExecutionProtocolEvidenceV2,
  ExecutionReadClientV2,
  ExecutionStateCheckV2,
} from "./engine-types";
import type { OwnerTransactionV2 } from "./types";

function asAtomic(value: unknown, label: string): bigint {
  if (typeof value !== "bigint" || value < 0n) {
    throw new Error(`${label} returned a malformed atomic amount`);
  }
  return value;
}

export async function readAllowanceV2(
  client: ExecutionReadClientV2,
  token: Address,
  owner: Address,
  spender: Address,
  blockNumber: bigint,
): Promise<bigint> {
  return asAtomic(await client.readContract({
    address: token,
    abi: ERC20_STATE_ABI,
    functionName: "allowance",
    args: [owner, spender],
    blockNumber,
  }), "ERC20 allowance");
}

async function readBalance(
  client: ExecutionReadClientV2,
  token: Address,
  owner: Address,
  blockNumber: bigint,
): Promise<bigint> {
  return asAtomic(await client.readContract({
    address: token,
    abi: ERC20_STATE_ABI,
    functionName: "balanceOf",
    args: [owner],
    blockNumber,
  }), "ERC20 balance");
}

async function readScaledBalance(
  client: ExecutionReadClientV2,
  aToken: Address,
  owner: Address,
  blockNumber: bigint,
): Promise<bigint> {
  return asAtomic(await client.readContract({
    address: aToken,
    abi: A_TOKEN_EXECUTION_STATE_ABI,
    functionName: "scaledBalanceOf",
    args: [owner],
    blockNumber,
  }), "aToken scaled balance");
}

async function readNormalizedIncome(
  client: ExecutionReadClientV2,
  asset: Address,
  blockNumber: bigint,
): Promise<bigint> {
  const value = asAtomic(await client.readContract({
    address: PROTOCOL_REGISTRY.aaveV3.pool.address,
    abi: AAVE_EXECUTION_STATE_ABI,
    functionName: "getReserveNormalizedIncome",
    args: [asset],
    blockNumber,
  }), "Aave normalized income");
  if (value === 0n) throw new Error("Aave normalized income cannot be zero");
  return value;
}

export async function captureTransactionStateV2(
  client: ExecutionReadClientV2,
  transaction: OwnerTransactionV2,
  owner: Address,
  blockNumber: bigint,
): Promise<CapturedExecutionStateV2> {
  if (!isAddressEqual(transaction.from, owner)) throw new Error("Transaction owner mismatch");
  const descriptor = describeExecutionTransactionV2(transaction);
  if (descriptor.kind === "allowance") {
    return {
      ...descriptor,
      beforeAtomic: await readAllowanceV2(
        client, descriptor.token, owner, descriptor.spender, blockNumber,
      ),
    };
  }
  if (descriptor.kind === "swap") {
    const [beforeInputAtomic, beforeOutputAtomic] = await Promise.all([
      readBalance(client, descriptor.tokenIn, owner, blockNumber),
      readBalance(client, descriptor.tokenOut, owner, blockNumber),
    ]);
    return { ...descriptor, beforeInputAtomic, beforeOutputAtomic };
  }
  const [beforeInputAtomic, scaledATokenBeforeAtomic, normalizedIncomeBeforeRay] =
    await Promise.all([
      readBalance(client, descriptor.asset, owner, blockNumber),
      readScaledBalance(client, descriptor.aToken, owner, blockNumber),
      readNormalizedIncome(client, descriptor.asset, blockNumber),
    ]);
  return {
    ...descriptor,
    beforeInputAtomic,
    scaledATokenBeforeAtomic,
    normalizedIncomeBeforeRay,
  };
}

function requireEvidence<T extends ExecutionProtocolEvidenceV2["kind"]>(
  evidence: ExecutionProtocolEvidenceV2,
  kind: T,
): Extract<ExecutionProtocolEvidenceV2, { kind: T }> {
  if (evidence.kind !== kind) throw new Error("Protocol evidence does not match the step");
  return evidence as Extract<ExecutionProtocolEvidenceV2, { kind: T }>;
}

export async function validateTransactionStateV2(
  client: ExecutionReadClientV2,
  owner: Address,
  blockNumber: bigint,
  before: CapturedExecutionStateV2,
  evidence: ExecutionProtocolEvidenceV2,
): Promise<ExecutionStateCheckV2> {
  if (before.kind === "allowance") {
    requireEvidence(evidence, "approval");
    const afterAtomic = await readAllowanceV2(
      client, before.token, owner, before.spender, blockNumber,
    );
    if (afterAtomic !== before.expectedAtomic) {
      throw new Error("Receipt did not produce the exact allowance");
    }
    return { ...before, afterAtomic };
  }
  if (before.kind === "swap") {
    const swap = requireEvidence(evidence, "swap");
    const [afterInputAtomic, afterOutputAtomic] = await Promise.all([
      readBalance(client, before.tokenIn, owner, blockNumber),
      readBalance(client, before.tokenOut, owner, blockNumber),
    ]);
    if (afterInputAtomic > before.beforeInputAtomic ||
      before.beforeInputAtomic - afterInputAtomic !== before.amountInAtomic) {
      throw new Error("Swap input spend does not match the signed exact input");
    }
    if (afterOutputAtomic < before.beforeOutputAtomic ||
      afterOutputAtomic - before.beforeOutputAtomic < swap.outputAtomic) {
      throw new Error("Owner did not receive the event-attributed swap output");
    }
    return {
      kind: "swap",
      tokenIn: before.tokenIn,
      tokenOut: before.tokenOut,
      inputSpentAtomic: before.amountInAtomic,
      outputDeltaAtomic: swap.outputAtomic,
      ownerOutputBalanceDeltaAtomic: afterOutputAtomic - before.beforeOutputAtomic,
      minimumOutputAtomic: before.minimumOutputAtomic,
    };
  }
  const supply = requireEvidence(evidence, "aave-supply");
  const [afterInputAtomic, scaledAfter, incomeAfter] = await Promise.all([
    readBalance(client, before.asset, owner, blockNumber),
    readScaledBalance(client, before.aToken, owner, blockNumber),
    readNormalizedIncome(client, before.asset, blockNumber),
  ]);
  if (afterInputAtomic > before.beforeInputAtomic ||
    before.beforeInputAtomic - afterInputAtomic !== supply.suppliedAtomic) {
    throw new Error("Aave input spend does not match the Supply event");
  }
  if (scaledAfter <= before.scaledATokenBeforeAtomic) {
    throw new Error("Aave scaled aToken balance did not increase");
  }
  if (incomeAfter !== supply.mintIndexRay) {
    throw new Error("Aave Mint index does not match normalized income");
  }
  const scaledDelta = scaledAfter - before.scaledATokenBeforeAtomic;
  if (scaledDelta !== rayDivFloor(supply.suppliedAtomic, incomeAfter)) {
    throw new Error("Aave scaled aToken delta does not match supplied amount");
  }
  const principalMint = supply.mintValueAtomic - supply.mintBalanceIncreaseAtomic;
  const expectedPrincipalMint = rayMulFloor(scaledAfter, incomeAfter) - rayMulFloor(
    before.scaledATokenBeforeAtomic,
    incomeAfter,
  );
  if (principalMint !== expectedPrincipalMint) {
    throw new Error("Aave Mint event does not match aggregate scaled balance rounding");
  }
  return {
    kind: "aave-supply",
    asset: before.asset,
    aToken: before.aToken,
    inputSpentAtomic: supply.suppliedAtomic,
    suppliedAtomic: supply.suppliedAtomic,
    scaledATokenDeltaAtomic: scaledDelta,
    normalizedIncomeBeforeRay: before.normalizedIncomeBeforeRay,
    normalizedIncomeAfterRay: incomeAfter,
  };
}
