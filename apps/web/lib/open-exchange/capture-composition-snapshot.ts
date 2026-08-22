import {
  CapabilityCompositionPolicyV1Schema,
  CapabilityCompositionSnapshotV1Schema,
  StablecoinPolicyV2Schema,
  commitment,
  type CapabilityCompositionPolicyV1,
  type CapabilityCompositionSnapshotV1,
} from "@cobia/domain";
import type { Address } from "viem";
import { productionCapabilityManifestV1 } from "../capabilities/manifest";
import {
  captureRouteSnapshotV2,
  type RouteSnapshotV2Dependencies,
} from "../orchestrator/capture-route-snapshot-v2";

const NATIVE_OKB = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const ADAPTER_BY_CAPABILITY = {
  "aave-v3.supply@1": "aave-v3@1",
  "curve-stableswap-ng.exact-input@1": "curve-stableswap-ng@1",
  "uniswap-v3.exact-input@1": "uniswap-v3@1",
} as const;

interface Dependencies {
  route: RouteSnapshotV2Dependencies;
  getGasPrice(): Promise<bigint>;
  getNativeToken(): Promise<{
    chainId: number;
    token: Address;
    symbol: string;
    decimals: number;
    priceUsd: string;
  } | undefined>;
}

function decimalToE8(value: string): string {
  const match = value.match(/^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/);
  if (!match || (match[2]?.length ?? 0) > 8) throw new Error("OKB price precision is invalid");
  const atomic = BigInt(match[1]!) * 100_000_000n +
    BigInt((match[2] ?? "").padEnd(8, "0"));
  if (atomic <= 0n) throw new Error("OKB price must be positive");
  return atomic.toString();
}

function routePolicy(policy: CapabilityCompositionPolicyV1) {
  const maximumLoss = policy.constraints.find((item) =>
    item.kind === "maximum-conversion-loss");
  if (!maximumLoss) throw new Error("Composition conversion-loss authority is missing");
  const allowedAdapters = policy.allowedCapabilities.map(({ id, version }) => {
    const key = `${id}@${version}` as keyof typeof ADAPTER_BY_CAPABILITY;
    const adapter = ADAPTER_BY_CAPABILITY[key];
    if (!adapter) throw new Error(`Capability ${key} has no registered route adapter`);
    return adapter;
  }).sort();
  return StablecoinPolicyV2Schema.parse({
    version: 2,
    requestId: policy.requestId,
    owner: policy.owner,
    executionChainId: 196,
    asset: policy.input.token,
    principalAtomic: policy.input.maxAtomic,
    protocolExposureBps: 10_000,
    minTvlUsdE6: "0",
    minPreGasApyBps: 0,
    maxSnapshotAgeSec: policy.maxEvidenceAgeSec,
    deadline: policy.deadline,
    noBridges: true,
    allowedOutputAssets: policy.allowedAssets,
    allowedAdapters,
    maxSlippageBps: maximumLoss.maximumLossBps,
    horizonDays: policy.objective.horizonDays,
    objective: { kind: "earn" },
  });
}

export async function captureCapabilityCompositionSnapshotV1(
  value: CapabilityCompositionPolicyV1,
  dependencies: Dependencies,
): Promise<CapabilityCompositionSnapshotV1> {
  const policy = CapabilityCompositionPolicyV1Schema.parse(value);
  const activeManifestHash = commitment(productionCapabilityManifestV1());
  if (policy.manifestHash !== activeManifestHash) {
    throw new Error("Composition policy targets another capability manifest");
  }
  const [route, gasPrice, native] = await Promise.all([
    captureRouteSnapshotV2(routePolicy(policy), dependencies.route),
    dependencies.getGasPrice(),
    dependencies.getNativeToken(),
  ]);
  if (gasPrice <= 0n) throw new Error("X Layer gas price must be positive");
  if (!native || native.chainId !== 196 || native.token.toLowerCase() !== NATIVE_OKB ||
      native.symbol !== "OKB" || native.decimals !== 18) {
    throw new Error("Exact X Layer OKB market evidence is unavailable");
  }
  return CapabilityCompositionSnapshotV1Schema.parse({
    version: 1,
    kind: "capability-composition",
    requestId: policy.requestId,
    capturedAt: route.capturedAt,
    manifestHash: activeManifestHash,
    route,
    gas: {
      priceAtomic: gasPrice.toString(),
      nativePriceUsdE8: decimalToE8(native.priceUsd),
    },
  });
}
