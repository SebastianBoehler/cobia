import {
  commitment,
  estimateRouteEconomicsV2,
  RoutePlanV2Schema,
  verifyRouteBundleV2,
  type RouteBundleV2,
  type RoutePlanV2,
  type RouteSnapshotV2,
  type StablecoinPolicyV2,
} from "@cobia/domain";
import { privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";
import { PROTOCOL_REGISTRY, registryHash } from "../adapters/registry";

export const OWNER = "0x1111111111111111111111111111111111111111" as const;
export const DEADLINE_SEC = 2_000_000_000;
export const NOW_SEC = 1_999_999_800;
export const INPUT_ATOMIC = 50_000_000n;
export const OUTPUT_ATOMIC = 49_900_000n;
export const MINIMUM_OUTPUT_ATOMIC = 49_000_000n;

export const usdg = PROTOCOL_REGISTRY.aaveV3.assets.USDG.underlying.address;
export const usdt0 = PROTOCOL_REGISTRY.aaveV3.assets.USDt0.underlying.address;
const usdgLower = usdg.toLowerCase() as Address;
const usdt0Lower = usdt0.toLowerCase() as Address;

export const directPlan = {
  version: 2,
  inputAsset: usdt0,
  inputAtomic: "100000000",
  retainedAtomic: "50000000",
  horizonDays: 30,
  legs: [{
    id: "direct-supply",
    inputAtomic: INPUT_ATOMIC.toString(),
    actions: [{
      kind: "aave-v3-supply",
      opportunityId: `aave-v3:${usdt0.toLowerCase()}`,
      consume: "all",
      asset: usdt0,
    }],
  }],
} as const;

export const swapPlan = {
  ...directPlan,
  legs: [{
    id: "swap-then-supply",
    inputAtomic: INPUT_ATOMIC.toString(),
    actions: [{
      kind: "uniswap-v3-exact-input",
      opportunityId: "uniswap-v3:registered-pair",
      consume: "all",
      tokenIn: usdt0,
      tokenOut: usdg,
      quotedOutputAtomic: OUTPUT_ATOMIC.toString(),
      minimumOutputAtomic: MINIMUM_OUTPUT_ATOMIC.toString(),
    }, {
      kind: "aave-v3-supply",
      opportunityId: `aave-v3:${usdg.toLowerCase()}`,
      consume: "all",
      asset: usdg,
    }],
  }],
} as const;

export const noActionPlan = {
  ...directPlan,
  retainedAtomic: directPlan.inputAtomic,
  legs: [],
} as const;

const requestId = "550e8400-e29b-41d4-a716-446655440010";
const solver = privateKeyToAccount(`0x${"31".repeat(32)}`);

export const executionPolicy: StablecoinPolicyV2 = {
  version: 2,
  requestId,
  owner: OWNER,
  executionChainId: 196,
  asset: usdt0Lower,
  principalAtomic: directPlan.inputAtomic,
  protocolExposureBps: 5_000,
  minTvlUsdE6: "1000000",
  minPreGasApyBps: 0,
  maxSnapshotAgeSec: 300,
  deadline: DEADLINE_SEC,
  noBridges: true,
  allowedOutputAssets: [usdgLower, usdt0Lower],
  allowedAdapters: ["aave-v3@1", "uniswap-v3@1"],
  maxSlippageBps: 200,
  horizonDays: directPlan.horizonDays,
};

const executionSnapshot: RouteSnapshotV2 = {
  version: 2,
  requestId,
  chainId: 196,
  blockNumber: "67649362",
  blockHash: PROTOCOL_REGISTRY.auditedAtBlock.hash,
  capturedAt: new Date((DEADLINE_SEC - 300) * 1_000).toISOString(),
  adapterRegistryHash: registryHash,
  scannedAdapters: ["aave-v3@1", "uniswap-v3@1"],
  valuations: [
    { asset: usdgLower, decimals: 6, priceUsdE8: "100000000" },
    { asset: usdt0Lower, decimals: 6, priceUsdE8: "100000000" },
  ],
  opportunities: [
    {
      id: `aave-v3:${usdg.toLowerCase()}`,
      kind: "aave-v3-supply",
      adapterId: "aave-v3@1",
      asset: usdgLower,
      supplyRateBps: 400,
      tvlUsdE6: "1000000000",
      availableLiquidityAtomic: "1000000000",
      validatedSupplyAtomic: OUTPUT_ATOMIC.toString(),
    },
    {
      id: `aave-v3:${usdt0.toLowerCase()}`,
      kind: "aave-v3-supply",
      adapterId: "aave-v3@1",
      asset: usdt0Lower,
      supplyRateBps: 24,
      tvlUsdE6: "1000000000",
      availableLiquidityAtomic: "1000000000",
      validatedSupplyAtomic: INPUT_ATOMIC.toString(),
    },
    {
      id: "uniswap-v3:registered-pair",
      kind: "uniswap-v3-exact-input",
      adapterId: "uniswap-v3@1",
      tokenIn: usdt0Lower,
      tokenOut: usdgLower,
      feeTier: 100,
      quotedInputAtomic: INPUT_ATOMIC.toString(),
      quotedOutputAtomic: OUTPUT_ATOMIC.toString(),
      estimatedGas: "100000",
    },
  ],
};

export async function verifiedExecutionInput(rawPlan: unknown = directPlan) {
  const routePlan: RoutePlanV2 = RoutePlanV2Schema.parse(rawPlan);
  const unsigned: Omit<RouteBundleV2, "signature"> = {
    version: 2,
    requestId,
    solverId: "execution-test-solver",
    solverAddress: solver.address.toLowerCase() as Address,
    policyHash: commitment(executionPolicy),
    snapshotHash: commitment(executionSnapshot),
    routePlan,
    evidence: [],
    riskFlags: [],
    estimatedPreGasApyBps: estimateRouteEconomicsV2(
      executionPolicy,
      executionSnapshot,
      routePlan,
    ).estimatedPreGasApyBps,
    validUntil: DEADLINE_SEC,
  };
  const signature = await solver.signMessage({ message: { raw: commitment(unsigned) } });
  const bundle: RouteBundleV2 = { ...unsigned, signature };
  const verdict = await verifyRouteBundleV2(
    executionPolicy,
    executionSnapshot,
    bundle,
    solver.address,
    { expectedAdapterRegistryHash: registryHash },
    NOW_SEC,
  );
  if (!verdict.routeAuthorized) {
    throw new Error(`Execution fixture was not authorized: ${verdict.errorCodes.join(",")}`);
  }
  return { policy: executionPolicy, bundle, verdict };
}
