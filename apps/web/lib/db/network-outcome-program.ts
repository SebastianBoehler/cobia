import { TransactionProgramV1Schema, type TransactionStageV1 } from "@cobia/domain";
import { CapabilityProgramV2Schema } from "@cobia/solvers";

interface AssetAmount {
  token: string;
  atomic: string;
}

export interface NetworkProgramPrincipalV1 {
  chainId: number;
  principals: AssetAmount[];
  intentClass: string;
  resultLabel: string;
  route: { protocols: string[]; minimumOutputs: AssetAmount[] };
}

const protocolPrefixes = [
  ["aave-v3.", "Aave V3"],
  ["curve-stableswap-ng.", "Curve"],
  ["uniswap-v3.", "Uniswap V3"],
  ["okx-dex-api", "OKX DEX"],
] as const;

function protocols(ids: readonly string[]): string[] {
  const matched = ids.flatMap((id) => {
    const protocol = protocolPrefixes.find(([prefix]) => id.startsWith(prefix))?.[1];
    return protocol ? [protocol] : [];
  });
  return matched.filter((protocol, index) => matched.indexOf(protocol) === index);
}

function aggregateAssets(assets: AssetAmount[]): AssetAmount[] {
  const totals = new Map<string, bigint>();
  for (const asset of assets) {
    totals.set(asset.token, (totals.get(asset.token) ?? 0n) + BigInt(asset.atomic));
  }
  return [...totals].map(([token, atomic]) => ({ token, atomic: atomic.toString() }));
}

function stageInput(stage: TransactionStageV1): AssetAmount | null {
  if (stage.kind === "wallet-transaction" || stage.kind === "cobia-v3") return stage.input;
  if (stage.kind === "x402-authorization") {
    return { token: stage.asset, atomic: stage.exactAtomic };
  }
  return null;
}

function stageOutputs(stage: TransactionStageV1): AssetAmount[] {
  if (stage.kind === "wallet-transaction") {
    return [{ token: stage.output.token, atomic: stage.output.minimumAtomic }];
  }
  if (stage.kind === "cobia-v3") {
    return stage.minimumOutcomes.map(({ token, minimumAtomic }) => ({ token, atomic: minimumAtomic }));
  }
  if (stage.kind === "async-delivery") {
    return [{ token: stage.output.token, atomic: stage.output.minimumAtomic }];
  }
  return [];
}

export function capabilityNetworkPrincipalV1(payload: unknown): NetworkProgramPrincipalV1 | null {
  const parsed = CapabilityProgramV2Schema.safeParse(payload);
  if (!parsed.success) return null;
  const ids = parsed.data.actions.map(({ capabilityId }) => capabilityId);
  const hasSwap = ids.some((id) => id.includes("exact-input"));
  const hasSupply = ids.some((id) => id.includes("supply"));
  return {
    chainId: parsed.data.chainId,
    principals: [parsed.data.input],
    intentClass: hasSwap && hasSupply ? "yield-composition"
      : hasSwap ? "stablecoin-swap" : hasSupply ? "protocol-supply" : "onchain-outcome",
    resultLabel: hasSwap && hasSupply ? "Swap and supply"
      : hasSwap ? "Token swap" : hasSupply ? "Protocol supply" : "X Layer outcome",
    route: {
      protocols: protocols(ids),
      minimumOutputs: parsed.data.balanceConstraints.map(({ token, atomic }) => ({ token, atomic })),
    },
  };
}

export function transactionNetworkPrincipalV1(payload: unknown): NetworkProgramPrincipalV1 | null {
  const parsed = TransactionProgramV1Schema.safeParse(payload);
  if (!parsed.success) return null;
  const stages = parsed.data.stages.filter((stage) => stage.kind !== "research");
  const stageIds = new Set(stages.map(({ id }) => id));
  const dependedOn = new Set(stages.flatMap(({ dependsOn }) => dependsOn.filter((id) => stageIds.has(id))));
  const roots = stages.filter((stage) =>
    stageInput(stage) && !stage.dependsOn.some((id) => stageIds.has(id)));
  const leaves = stages.filter(({ id }) => !dependedOn.has(id));
  const principals = aggregateAssets(roots.flatMap((stage) => stageInput(stage) ?? []));
  if (!principals.length || !roots.every(({ chainId }) => chainId === roots[0]!.chainId)) return null;
  const minimumOutputs = aggregateAssets(leaves.flatMap(stageOutputs));
  const walletTools = stages.flatMap((stage) => stage.kind === "wallet-transaction" ? stage.tools : []);
  const multiAsset = principals.length > 1 || minimumOutputs.length > 1;
  const root = roots[0]!;

  if (roots.length === 1 && root.kind === "cobia-v3") return {
    chainId: root.chainId,
    principals,
    intentClass: "cobia-v3",
    resultLabel: "Atomic outcome",
    route: { protocols: protocols(walletTools), minimumOutputs },
  };
  if (roots.length === 1 && root.kind === "x402-authorization") return {
    chainId: root.chainId,
    principals,
    intentClass: "x402-payment",
    resultLabel: "x402 settlement",
    route: { protocols: protocols(walletTools), minimumOutputs },
  };
  return {
    chainId: root.chainId,
    principals,
    intentClass: multiAsset ? "multi-asset-swap" : "wallet-transaction",
    resultLabel: multiAsset ? "Multi-asset swap" : "Transaction",
    route: { protocols: protocols(walletTools), minimumOutputs },
  };
}
