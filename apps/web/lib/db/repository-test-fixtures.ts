import {
  projectRouteQuote,
  projectRouteQuoteV2,
  verifyBundle,
  verifyRouteBundleV2,
  type MarketSnapshot,
  type RouteSnapshotV2,
  type StablecoinPolicy,
  type StablecoinPolicyV2,
} from "@cobia/domain";
import {
  createDeterministicRouteSolverV2,
  createDeterministicSolver,
} from "@cobia/solvers";
import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";
import { registryHash } from "../adapters/registry";
import { USDT_ADDRESS } from "../chain/supported-assets";
import { USDG_ADDRESS } from "../chain/xlayer";

export const repositoryTestAccount = privateKeyToAccount(
  keccak256(toHex("cobia-repository-test-signer")),
);
export const repositoryTestNowSec = Date.parse("2026-08-09T10:01:00.000Z") / 1_000;

export async function createRepositoryFixture({
  asset = USDG_ADDRESS,
  symbol = "USDG",
}: { asset?: Address; symbol?: string } = {}) {
  const requestId = crypto.randomUUID();
  const policy: StablecoinPolicy = {
    version: 1,
    requestId,
    owner: repositoryTestAccount.address,
    executionChainId: 196,
    asset,
    principalAtomic: "25000000000",
    maxProtocolExposureBps: 4_000,
    minTvlUsdE6: "250000000000",
    minNetApyBps: 200,
    maxSnapshotAgeSec: 300,
    deadline: 2_000_000_000,
    noBridges: true,
  };
  const snapshot: MarketSnapshot = {
    version: 1,
    requestId,
    chainId: 196,
    blockNumber: "1000",
    blockHash: `0x${"ab".repeat(32)}`,
    capturedAt: "2026-08-09T10:00:00.000Z",
    asset: { address: asset, symbol, decimals: 6 },
    candidates: [
      {
        id: "cash:usdg",
        kind: "cash",
        apyBps: 0,
        tvlUsdE6: "0",
        retrievedAt: "2026-08-09T10:00:00.000Z",
      },
      {
        id: "aave-v3:9001",
        kind: "aave-v3",
        investmentId: "9001",
        poolAddress: "0x2222222222222222222222222222222222222222",
        apyBps: 642,
        tvlUsdE6: "500000000000",
        utilizationBps: 7_200,
        retrievedAt: "2026-08-09T10:00:00.000Z",
      },
    ],
  };
  const solver = createDeterministicSolver({
    solverId: "determinist",
    account: repositoryTestAccount,
  });
  const bundle = await solver.solve({ policy, snapshot, nowSec: repositoryTestNowSec });
  const verdict = await verifyBundle(
    policy,
    snapshot,
    bundle,
    solver.address,
    repositoryTestNowSec,
  );
  const quote = projectRouteQuote(bundle, verdict, "100000", repositoryTestNowSec + 240);
  return { policy, snapshot, bundle, verdict, quote };
}

export async function createRepositoryFixtureV2({
  principalAtomic = "25000001",
  protocolExposureBps = 6_000,
  preferredRoute,
}: {
  principalAtomic?: string;
  protocolExposureBps?: number;
  preferredRoute?: "direct" | "uniswap" | "curve";
} = {}) {
  const requestId = crypto.randomUUID();
  const usdg = USDG_ADDRESS.toLowerCase() as Address;
  const usdt0 = USDT_ADDRESS.toLowerCase() as Address;
  const deployedAtomic = (
    BigInt(principalAtomic) * BigInt(protocolExposureBps) / 10_000n
  ).toString();
  const usesCurve = preferredRoute === "curve";
  const allowedAdapters = usesCurve
    ? ["aave-v3@1", "curve-stableswap-ng@1"] as const
    : ["aave-v3@1", "uniswap-v3@1"] as const;
  const policy: StablecoinPolicyV2 = {
    version: 2,
    requestId,
    owner: repositoryTestAccount.address,
    executionChainId: 196,
    asset: usdt0,
    principalAtomic,
    protocolExposureBps,
    minTvlUsdE6: "1000000",
    minPreGasApyBps: 0,
    maxSnapshotAgeSec: 300,
    deadline: 2_000_000_000,
    noBridges: true,
    allowedOutputAssets: [usdg, usdt0],
    allowedAdapters: [...allowedAdapters],
    maxSlippageBps: 100,
    horizonDays: 30,
  };
  const snapshot: RouteSnapshotV2 = {
    version: 2,
    requestId,
    chainId: 196,
    blockNumber: "1001",
    blockHash: `0x${"bc".repeat(32)}`,
    capturedAt: "2026-08-09T10:00:00.000Z",
    adapterRegistryHash: registryHash,
    scannedAdapters: [...allowedAdapters],
    valuations: [
      { asset: usdg, decimals: 6, priceUsdE8: "100000000" },
      { asset: usdt0, decimals: 6, priceUsdE8: "100000000" },
    ],
    opportunities: [
      {
        id: "aave:usdt0",
        kind: "aave-v3-supply",
        adapterId: "aave-v3@1",
        asset: usdt0,
        supplyRateBps: preferredRoute === "direct" ? 50 : 26,
        tvlUsdE6: "500000000000",
        availableLiquidityAtomic: "0",
        validatedSupplyAtomic: deployedAtomic,
      },
      usesCurve ? {
        id: "curve:usdt0-usdg",
        kind: "curve-stableswap-ng-exact-input" as const,
        adapterId: "curve-stableswap-ng@1" as const,
        pool: "0x31F066aA0A687d4F383F96a514984AF727Eb8e38" as Address,
        tokenIn: usdt0,
        tokenOut: usdg,
        inputIndex: 1 as const,
        outputIndex: 0 as const,
        fee: "1000000",
        quotedInputAtomic: deployedAtomic,
        quotedOutputAtomic: deployedAtomic,
      } : {
        id: "uniswap:usdt0-usdg",
        kind: "uniswap-v3-exact-input" as const,
        adapterId: "uniswap-v3@1" as const,
        tokenIn: usdt0,
        tokenOut: usdg,
        feeTier: 100,
        quotedInputAtomic: deployedAtomic,
        quotedOutputAtomic: deployedAtomic,
        estimatedGas: "100000",
      },
      {
        id: "aave:usdg",
        kind: "aave-v3-supply",
        adapterId: "aave-v3@1",
        asset: usdg,
        supplyRateBps: 39,
        tvlUsdE6: "500000000000",
        availableLiquidityAtomic: "0",
        validatedSupplyAtomic: deployedAtomic,
      },
    ],
  };
  const solver = createDeterministicRouteSolverV2({
    solverId: "route-solver",
    account: repositoryTestAccount,
    expectedAdapterRegistryHash: registryHash,
  });
  const bundle = await solver.solve({ policy, snapshot, nowSec: repositoryTestNowSec });
  const verdict = await verifyRouteBundleV2(
    policy,
    snapshot,
    bundle,
    solver.address,
    { expectedAdapterRegistryHash: registryHash },
    repositoryTestNowSec,
  );
  const quote = projectRouteQuoteV2(
    bundle,
    verdict,
    "100000",
    repositoryTestNowSec + 240,
  );
  return { policy, snapshot, bundle, verdict, quote };
}

export function freshReceiptHash() {
  return keccak256(toHex(crypto.randomUUID()));
}
