import {
  assertVerifiedRouteVerdictV2,
  commitment,
  type RouteBundleV2,
  type RouteVerificationVerdictV2,
  type StablecoinPolicyV2,
} from "@cobia/domain";
import {
  encodeFunctionData,
  getAddress,
  isAddress,
  keccak256,
  toBytes,
  type Address,
  type Hash,
} from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import {
  AAVE_POOL_SUPPLY_ABI,
  CURVE_STABLESWAP_NG_EXCHANGE_ABI,
  SWAP_ROUTER02_ABI,
} from "../execution-v2/abis";
import {
  parseExecutionContextV2,
  registeredCurveSwap,
  registeredExecutionAsset,
  registeredSwapPair,
} from "../execution-v2/execution-context";
import {
  ATOMIC_ROUTE_CAP,
  assertAtomicRouteV1,
  type AtomicBalanceConstraintV1,
  type AtomicRouteV1,
  type AtomicStepV1,
} from "./types";

export interface ProjectAtomicRouteInputV1 {
  policy: StablecoinPolicyV2;
  bundle: RouteBundleV2;
  verdict: RouteVerificationVerdictV2;
  executor: Address;
  simulationHash: Hash;
  nonce: Hash;
  nowSec: number;
}

function adapterId(value: string): Hash {
  return keccak256(toBytes(value));
}

function minimumReceiptIncrease(amount: bigint): bigint {
  return amount > 1n ? amount - 1n : amount;
}

function aaveStep(input: {
  asset: Address;
  amount: bigint;
  owner: Address;
}): { step: AtomicStepV1; constraint: AtomicBalanceConstraintV1 } {
  const asset = registeredExecutionAsset(input.asset);
  return {
    step: {
      adapterId: adapterId(PROTOCOL_REGISTRY.aaveV3.adapterId),
      target: PROTOCOL_REGISTRY.aaveV3.pool.address,
      spendToken: asset.address,
      spendAmount: input.amount,
      data: encodeFunctionData({
        abi: AAVE_POOL_SUPPLY_ABI,
        functionName: "supply",
        args: [asset.address, input.amount, input.owner, 0],
      }),
    },
    constraint: {
      token: asset.aToken,
      account: input.owner,
      minimumIncrease: minimumReceiptIncrease(input.amount),
    },
  };
}

function swapStep(input: {
  action: Extract<
    ProjectAtomicRouteInputV1["bundle"]["routePlan"]["legs"][number]["actions"][number],
    { kind: "uniswap-v3-exact-input" | "curve-stableswap-ng-exact-input" }
  >;
  amountIn: bigint;
  executor: Address;
}): AtomicStepV1 {
  const { action, amountIn, executor } = input;
  if (action.kind === "curve-stableswap-ng-exact-input") {
    const pair = registeredCurveSwap(
      action.tokenIn,
      action.tokenOut,
      action.pool,
      action.inputIndex,
      action.outputIndex,
    );
    if (action.fee !== PROTOCOL_REGISTRY.curveStableSwapNg.pair.fee) {
      throw new Error("Curve fee does not match the atomic registry");
    }
    return {
      adapterId: adapterId(PROTOCOL_REGISTRY.curveStableSwapNg.adapterId),
      target: pair.pool,
      spendToken: pair.input.address,
      spendAmount: amountIn,
      data: encodeFunctionData({
        abi: CURVE_STABLESWAP_NG_EXCHANGE_ABI,
        functionName: "exchange",
        args: [
          BigInt(action.inputIndex),
          BigInt(action.outputIndex),
          amountIn,
          BigInt(action.minimumOutputAtomic),
          executor,
        ],
      }),
    };
  }
  const pair = registeredSwapPair(action.tokenIn, action.tokenOut);
  return {
    adapterId: adapterId(PROTOCOL_REGISTRY.uniswapV3.adapterId),
    target: PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address,
    spendToken: pair.input.address,
    spendAmount: amountIn,
    data: encodeFunctionData({
      abi: SWAP_ROUTER02_ABI,
      functionName: "exactInputSingle",
      args: [{
        tokenIn: pair.input.address,
        tokenOut: pair.output.address,
        fee: pair.fee,
        recipient: executor,
        amountIn,
        amountOutMinimum: BigInt(action.minimumOutputAtomic),
        sqrtPriceLimitX96: 0n,
      }],
    }),
  };
}

export function projectAtomicRouteV1(input: ProjectAtomicRouteInputV1): AtomicRouteV1 {
  assertVerifiedRouteVerdictV2(input.bundle, input.verdict);
  if (!input.verdict.routeAuthorized || input.verdict.errorCodes.length > 0) {
    throw new Error("Atomic execution requires an authorized route verdict");
  }
  if (!isAddress(input.executor) || /^0x0{40}$/i.test(input.executor)) {
    throw new Error("Atomic executor address is invalid");
  }
  const { routePlan, owner, deadlineSec } = parseExecutionContextV2(input);
  const leg = routePlan.legs[0];
  if (!leg) throw new Error("A retain-only route has no atomic execution");
  const amountIn = BigInt(leg.inputAtomic);
  if (amountIn > ATOMIC_ROUTE_CAP) throw new Error("Route exceeds the 10 USD beta cap");
  const [first, second] = leg.actions;
  let steps: AtomicStepV1[];
  let constraint: AtomicBalanceConstraintV1;
  if (first.kind === "aave-v3-supply") {
    const supply = aaveStep({ asset: first.asset, amount: amountIn, owner });
    steps = [supply.step];
    constraint = supply.constraint;
  } else if (
    (first.kind === "uniswap-v3-exact-input" ||
      first.kind === "curve-stableswap-ng-exact-input") &&
    second?.kind === "aave-v3-supply"
  ) {
    const minimumOutput = BigInt(first.minimumOutputAtomic);
    const supply = aaveStep({ asset: second.asset, amount: minimumOutput, owner });
    steps = [
      swapStep({ action: first, amountIn, executor: getAddress(input.executor) }),
      supply.step,
    ];
    constraint = supply.constraint;
  } else {
    throw new Error("This route family is not enabled for atomic execution");
  }
  const route: AtomicRouteV1 = {
    policyHash: input.bundle.policyHash,
    snapshotHash: input.bundle.snapshotHash,
    bundleHash: input.verdict.bundleHash,
    routeHash: commitment(routePlan),
    simulationHash: input.simulationHash,
    owner,
    inputToken: getAddress(routePlan.inputAsset),
    inputAmount: amountIn,
    deadline: BigInt(deadlineSec),
    nonce: input.nonce,
    steps,
    constraints: [constraint],
  };
  assertAtomicRouteV1(route);
  return route;
}
