import {
  assertVerifiedRouteVerdictV2,
  commitment,
  RouteAddressV2Schema,
  RouteBundleV2Schema,
  StablecoinPolicyV2Schema,
  type RouteBundleV2,
  type RoutePlanV2,
  type RouteVerificationVerdictV2,
  type StablecoinPolicyV2,
} from "@cobia/domain";
import { encodeFunctionData, isAddressEqual, zeroAddress, type Address } from "viem";
import {
  PROTOCOL_REGISTRY,
  type RegistryAsset,
} from "../adapters/registry";
import { AAVE_POOL_SUPPLY_ABI, ERC20_APPROVE_ABI } from "./abis";
import {
  EXECUTION_CHAIN_ID,
  type ExecutionPostconditionV2,
  type OwnerTransactionV2,
} from "./types";

export interface ParsedExecutionContextV2 {
  routePlan: RoutePlanV2;
  owner: Address;
  deadlineSec: number;
}

export interface VerifiedExecutionInputV2 {
  policy: StablecoinPolicyV2;
  bundle: RouteBundleV2;
  verdict: RouteVerificationVerdictV2;
  nowSec: unknown;
}

export interface RegisteredExecutionAssetV2 {
  key: RegistryAsset;
  address: Address;
  aToken: Address;
}

const registeredAssets = Object.entries(PROTOCOL_REGISTRY.aaveV3.assets).map(
  ([key, asset]) => ({
    key: key as RegistryAsset,
    address: asset.underlying.address,
    aToken: asset.aToken.address,
  }),
);

function safeTimestamp(value: unknown, label: string, allowZero: boolean): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) ||
    (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`${label} must be a safe integer timestamp`);
  }
  return value;
}

export function parseExecutionContextV2(
  input: VerifiedExecutionInputV2,
): ParsedExecutionContextV2 {
  assertVerifiedRouteVerdictV2(input.bundle, input.verdict);
  if (!input.verdict.routeAuthorized || input.verdict.errorCodes.length !== 0) {
    throw new Error("Execution requires an authorized route verdict");
  }
  const policy = StablecoinPolicyV2Schema.parse(input.policy);
  const bundle = RouteBundleV2Schema.parse(input.bundle);
  if (commitment(policy).toLowerCase() !== bundle.policyHash.toLowerCase()) {
    throw new Error("Execution policy does not belong to the verified route bundle");
  }
  const routePlan = bundle.routePlan;
  const owner = RouteAddressV2Schema.parse(policy.owner);
  if (isAddressEqual(owner, zeroAddress)) throw new Error("Execution owner cannot be zero");
  const deadlineSec = safeTimestamp(bundle.validUntil, "Execution deadline", false);
  const nowSec = safeTimestamp(input.nowSec, "Current time", true);
  if (deadlineSec <= nowSec) throw new Error("Execution deadline is expired");
  return { routePlan, owner, deadlineSec };
}

export function parseAtomic(value: unknown, label: string): bigint {
  if (typeof value !== "bigint" || value < 0n) {
    throw new Error(`${label} must be a non-negative bigint`);
  }
  return value;
}

export function registeredExecutionAsset(address: Address): RegisteredExecutionAssetV2 {
  const asset = registeredAssets.find((candidate) =>
    isAddressEqual(candidate.address, address));
  if (!asset) throw new Error("Execution asset is not registered");
  return asset;
}

export function registeredSwapPair(tokenIn: Address, tokenOut: Address) {
  const input = registeredExecutionAsset(tokenIn);
  const output = registeredExecutionAsset(tokenOut);
  const pair = PROTOCOL_REGISTRY.uniswapV3.pair;
  const forward = input.key === pair.token0 && output.key === pair.token1;
  const reverse = input.key === pair.token1 && output.key === pair.token0;
  if (!forward && !reverse) throw new Error("Execution swap pair is not registered");
  return { input, output, fee: pair.fee } as const;
}

export function registeredCurveSwap(
  tokenIn: Address,
  tokenOut: Address,
  pool: Address,
  inputIndex: 0 | 1,
  outputIndex: 0 | 1,
) {
  const input = registeredExecutionAsset(tokenIn);
  const output = registeredExecutionAsset(tokenOut);
  const pair = PROTOCOL_REGISTRY.curveStableSwapNg.pair;
  const forward = input.key === pair.token0 && output.key === pair.token1 &&
    inputIndex === 0 && outputIndex === 1;
  const reverse = input.key === pair.token1 && output.key === pair.token0 &&
    inputIndex === 1 && outputIndex === 0;
  if ((!forward && !reverse) || !isAddressEqual(pool, pair.pool.address)) {
    throw new Error("Curve execution pair is not registered");
  }
  return { input, output, pool: pair.pool.address } as const;
}

export function exactApprovalTransactions(input: {
  asset: RegisteredExecutionAssetV2;
  owner: Address;
  currentAllowanceAtomic: unknown;
  requiredAmountAtomic: bigint;
  spenderKind: "aave" | "curve" | "uniswap" | "position-manager";
}): OwnerTransactionV2[] {
  const allowance = parseAtomic(input.currentAllowanceAtomic, "Current allowance");
  if (allowance >= input.requiredAmountAtomic) return [];
  const spender = input.spenderKind === "aave"
    ? PROTOCOL_REGISTRY.aaveV3.pool.address
    : input.spenderKind === "curve"
      ? PROTOCOL_REGISTRY.curveStableSwapNg.pair.pool.address
    : input.spenderKind === "uniswap"
      ? PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address
      : PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager.address;
  const resetLabel = input.spenderKind === "aave"
    ? "reset-aave-allowance"
    : input.spenderKind === "curve"
      ? "reset-curve-allowance"
    : input.spenderKind === "uniswap"
      ? "reset-uniswap-allowance"
      : "reset-position-manager-allowance";
  const approveLabel = input.spenderKind === "aave"
    ? "approve-aave-exact"
    : input.spenderKind === "curve"
      ? "approve-curve-exact"
    : input.spenderKind === "uniswap"
      ? "approve-uniswap-exact"
      : "approve-position-manager-exact";
  const approval = (amount: bigint, label: typeof resetLabel | typeof approveLabel) => ({
    label,
    chainId: EXECUTION_CHAIN_ID,
    from: input.owner,
    to: input.asset.address,
    value: 0n,
    data: encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [spender, amount],
    }),
  }) satisfies OwnerTransactionV2;
  return allowance === 0n
    ? [approval(input.requiredAmountAtomic, approveLabel)]
    : [approval(0n, resetLabel), approval(input.requiredAmountAtomic, approveLabel)];
}

export function aaveSupplyTransaction(
  asset: RegisteredExecutionAssetV2,
  owner: Address,
  amountAtomic: bigint,
): OwnerTransactionV2 {
  return {
    label: "aave-v3-supply",
    chainId: EXECUTION_CHAIN_ID,
    from: owner,
    to: PROTOCOL_REGISTRY.aaveV3.pool.address,
    value: 0n,
    data: encodeFunctionData({
      abi: AAVE_POOL_SUPPLY_ABI,
      functionName: "supply",
      args: [asset.address, amountAtomic, owner, 0],
    }),
  };
}

export function aaveSupplyPostcondition(
  asset: RegisteredExecutionAssetV2,
  owner: Address,
  amountAtomic: bigint,
): ExecutionPostconditionV2 {
  return {
    kind: "aave-v3-supply",
    owner,
    asset: asset.address,
    aToken: asset.aToken,
    amountAtomic,
  };
}
