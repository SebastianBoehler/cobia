import {
  CapabilityCompositionPolicyV1Schema,
  CapabilityCompositionSnapshotV1Schema,
  RouteSnapshotV2Schema,
  StablecoinPolicyV2Schema,
  commitment,
  type CapabilityCompositionPolicyV1,
  type CapabilityCompositionSnapshotV1,
  type RouteSnapshotV2,
} from "@cobia/domain";
import { isAddressEqual, type Address } from "viem";
import { ProtocolIneligibleError } from "../adapters/protocol-error";
import {
  PROTOCOL_REGISTRY,
  registryHash,
  type RegistryAsset,
} from "../adapters/registry";
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
  if (!match) throw new Error("OKB price precision is invalid");
  const fraction = match[2] ?? "";
  const atomic = BigInt(match[1]!) * 100_000_000n +
    BigInt(fraction.slice(0, 8).padEnd(8, "0") || "0");
  const conservative = /[1-9]/.test(fraction.slice(8)) ? atomic + 1n : atomic;
  if (conservative <= 0n) throw new Error("OKB price must be positive");
  return conservative.toString();
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

function ceilDiv(value: bigint, divisor: bigint) {
  return (value + divisor - 1n) / divisor;
}

function minimumAtomicForValue(valueUsdE8: bigint, valuation: {
  decimals: number; priceUsdE8: string;
}) {
  return ceilDiv(valueUsdE8 * 10n ** BigInt(valuation.decimals),
    BigInt(valuation.priceUsdE8));
}

function registeredAsset(address: Address) {
  return Object.entries(PROTOCOL_REGISTRY.aaveV3.assets).find(([, asset]) =>
    isAddressEqual(asset.underlying.address, address));
}

async function captureCompositionFloors(input: {
  policy: CapabilityCompositionPolicyV1;
  route: RouteSnapshotV2;
  dependencies: Dependencies["route"];
}) {
  const loss = input.policy.constraints.find((item) =>
    item.kind === "maximum-conversion-loss")!;
  const receiptFloor = input.policy.constraints.find((item) =>
    item.kind === "minimum-registered-receipt-value")!;
  const terminal = input.policy.constraints.find((item) =>
    item.kind === "required-terminal-asset");
  const inputValuation = input.route.valuations.find(({ asset }) =>
    isAddressEqual(asset, input.policy.input.token));
  if (!inputValuation) throw new Error("Composition input valuation is missing");
  const inputValue = BigInt(input.policy.input.maxAtomic) *
    BigInt(inputValuation.priceUsdE8) / 10n ** BigInt(inputValuation.decimals);
  const conversionValue = ceilDiv(inputValue * BigInt(10_000 - loss.maximumLossBps), 10_000n);
  const receiptValue = ceilDiv(inputValue * BigInt(receiptFloor.minimumValueBps), 10_000n);
  const block = {
    number: BigInt(input.route.blockNumber), hash: input.route.blockHash,
    timestamp: BigInt(Math.floor(Date.parse(input.route.capturedAt) / 1_000)),
  };
  const additions = new Map<string, RouteSnapshotV2["opportunities"][number]>();

  for (const swap of input.route.opportunities) {
    if ((swap.kind !== "curve-stableswap-ng-exact-input" &&
        swap.kind !== "uniswap-v3-exact-input") ||
        !isAddressEqual(swap.tokenIn, input.policy.input.token) ||
        swap.quotedInputAtomic !== input.policy.input.maxAtomic ||
        (terminal && !isAddressEqual(swap.tokenOut, terminal.asset))) continue;
    const outputValuation = input.route.valuations.find(({ asset }) =>
      isAddressEqual(asset, swap.tokenOut));
    const registered = registeredAsset(swap.tokenOut);
    if (!outputValuation || !registered) continue;
    const unitFloor = ceilDiv(BigInt(swap.quotedOutputAtomic) *
      BigInt(10_000 - loss.maximumLossBps), 10_000n);
    const conversionFloor = minimumAtomicForValue(conversionValue, outputValuation);
    const receiptAtomic = minimumAtomicForValue(receiptValue, outputValuation);
    const receiptSupplyFloor = receiptAtomic === 1n ? 1n : receiptAtomic + 1n;
    const amount = [unitFloor, conversionFloor, receiptSupplyFloor]
      .reduce((maximum, value) => value > maximum ? value : maximum);
    if (amount > BigInt(swap.quotedOutputAtomic)) continue;
    const id = `aave-v3:${swap.tokenOut.toLowerCase()}:${amount}`;
    if (input.route.opportunities.some((item) => item.id === id) || additions.has(id)) continue;
    const baseline = input.route.opportunities.find((item) =>
      item.kind === "aave-v3-supply" && isAddressEqual(item.asset, swap.tokenOut));
    if (!baseline || baseline.kind !== "aave-v3-supply") continue;
    try {
      const [assetKey, expected] = registered as [RegistryAsset,
        (typeof PROTOCOL_REGISTRY.aaveV3.assets)[RegistryAsset]];
      const reserve = await input.dependencies.readReserve({ asset: assetKey,
        amountAtomic: amount, block });
      const rate = reserve.liquidityRateRay / 10n ** 23n;
      if (reserve.adapterId !== "aave-v3@1" || reserve.registryHash !== registryHash ||
          reserve.blockNumber !== block.number || reserve.blockHash !== block.hash ||
          reserve.blockTimestamp !== block.timestamp ||
          !isAddressEqual(reserve.asset, expected.underlying.address) ||
          !isAddressEqual(reserve.aToken, expected.aToken.address) ||
          reserve.decimals !== expected.decimals || reserve.validatedSupplyAtomic !== amount ||
          rate !== BigInt(baseline.supplyRateBps)) {
        throw new Error("Composition Aave floor does not match the pinned reserve");
      }
      additions.set(id, { ...baseline, id,
        availableLiquidityAtomic: reserve.availableLiquidityAtomic.toString(),
        validatedSupplyAtomic: amount.toString() });
    } catch (error) {
      if (!(error instanceof ProtocolIneligibleError)) throw error;
    }
  }
  if (!additions.size) return input.route;
  return RouteSnapshotV2Schema.parse({ ...input.route,
    opportunities: [...input.route.opportunities, ...additions.values()]
      .sort((left, right) => left.id.localeCompare(right.id)) });
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
  const [capturedRoute, gasPrice, native] = await Promise.all([
    captureRouteSnapshotV2(routePolicy(policy), dependencies.route),
    dependencies.getGasPrice(),
    dependencies.getNativeToken(),
  ]);
  if (gasPrice <= 0n) throw new Error("X Layer gas price must be positive");
  if (!native || native.chainId !== 196 || native.token.toLowerCase() !== NATIVE_OKB ||
      native.symbol !== "OKB" || native.decimals !== 18) {
    throw new Error("Exact X Layer OKB market evidence is unavailable");
  }
  const route = await captureCompositionFloors({
    policy, route: capturedRoute, dependencies: dependencies.route,
  });
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
