import { commitment } from "@cobia/domain";
import { encodeFunctionData, erc20Abi, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";
import { LifiVerifierManifestV1Schema } from "./manifest";
import { NormalizedLifiQuoteV1Schema, type NormalizedLifiQuoteV1 } from "./normalize";

const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
);
const AnchorSchema = z.object({
  chainId: z.union([z.literal(1), z.literal(196), z.literal(8453)]),
  blockNumber: z.string().regex(/^[1-9][0-9]*$/),
  blockHash: HashSchema,
}).strict();
const PolicySchema = z.object({
  owner: z.string().regex(/^0x[0-9a-f]{40}$/).transform((value) => value as Address),
  maximumInputAtomic: z.string().regex(/^[1-9][0-9]*$/).max(78),
  minimumOutputAtomic: z.string().regex(/^[1-9][0-9]*$/).max(78),
  deadline: z.number().int().positive().safe(),
  forbiddenTargets: z.array(z.string().regex(/^0x[0-9a-f]{40}$/)).max(32),
  forbiddenAssets: z.array(z.string().regex(/^0x[0-9a-f]{40}$/)).max(32),
}).strict();

export interface LifiSimulationV1 {
  reproduced: boolean;
  transactionSuccess: boolean;
  completeOwnerAssetDiff: boolean;
  transactionDataHash: Hash;
  gasUsed: string;
  observedInputDecreaseAtomic: string;
  observedOutputIncreaseAtomic: string;
  unexpectedOwnerAssetDecreases: Address[];
  traceHash: Hash;
  stateDiffHash: Hash;
}

interface VerificationInputV1 {
  quote: NormalizedLifiQuoteV1;
  manifest: unknown;
  anchors: unknown[];
  nowSec: number;
  policy: unknown;
  confirmAnchor(anchor: { chainId: 1 | 196 | 8453; blockNumber: string; blockHash: Hash }): Promise<boolean>;
  getCodeHash(chainId: 1 | 196 | 8453, address: Address, blockNumber: string): Promise<Hash | undefined>;
  simulate(input: {
    quote: NormalizedLifiQuoteV1;
    anchor: { chainId: 1 | 196 | 8453; blockNumber: string; blockHash: Hash };
  }): Promise<LifiSimulationV1>;
}

export type LifiVerificationV1 =
  | { accepted: false; errorCodes: string[] }
  | {
    accepted: true;
    guarantee: "atomic-same-chain" | "asynchronous-delivery";
    approvals: { to: Address; data: Hex; value: "0x0" }[];
    transaction: { to: Address; data: Hex; value: Hex };
    evidence: { traceHash: Hash; stateDiffHash: Hash; verificationHash: Hash };
  };

function reject(...errorCodes: string[]): LifiVerificationV1 {
  return { accepted: false, errorCodes: [...new Set(errorCodes)].sort() };
}

function entry<T extends { chainId: number; address: string }>(
  values: readonly T[], chainId: number, address: string,
): T | undefined {
  return values.find((value) => value.chainId === chainId && value.address === address);
}

export async function verifyLifiWalletTransactionV1(
  raw: VerificationInputV1,
): Promise<LifiVerificationV1> {
  let quote: NormalizedLifiQuoteV1;
  let manifest;
  let policy;
  let anchors;
  try {
    quote = NormalizedLifiQuoteV1Schema.parse(raw.quote);
    manifest = LifiVerifierManifestV1Schema.parse(raw.manifest);
    policy = PolicySchema.parse(raw.policy);
    anchors = z.array(AnchorSchema).min(1).max(2).parse(raw.anchors);
  } catch {
    return reject("INVALID_INPUT");
  }

  const errors: string[] = [];
  const deployment = entry(manifest.deployments, quote.fromChainId, quote.untrustedTransaction.to);
  const inputAsset = entry(manifest.assets, quote.fromChainId, quote.fromToken);
  const outputAsset = entry(manifest.assets, quote.toChainId, quote.toToken);
  const sourceAnchor = anchors.find(({ chainId }) => chainId === quote.fromChainId);
  const requiredChains = new Set([quote.fromChainId, quote.toChainId]);
  if (policy.owner !== quote.fromAddress || policy.owner !== quote.toAddress) errors.push("OWNER_MISMATCH");
  if (BigInt(quote.fromAmount) > BigInt(policy.maximumInputAtomic)) errors.push("INPUT_LIMIT_EXCEEDED");
  if (BigInt(quote.toAmountMin) < BigInt(policy.minimumOutputAtomic)) errors.push("OUTPUT_BOUND_WEAKENED");
  if (raw.nowSec - quote.fetchedAt > 300 || quote.fetchedAt > raw.nowSec) errors.push("QUOTE_STALE");
  if (quote.expiresAt <= raw.nowSec || policy.deadline > quote.expiresAt) errors.push("QUOTE_EXPIRED");
  if (policy.deadline <= raw.nowSec) errors.push("POLICY_EXPIRED");
  if (!deployment || quote.approvalAddress !== deployment?.address) errors.push("TARGET_NOT_REGISTERED");
  if (!deployment?.selectors.includes(quote.untrustedTransaction.selector)) errors.push("SELECTOR_NOT_REGISTERED");
  if (!quote.includedTools.every((tool) => deployment?.tools.includes(tool))) errors.push("TOOL_NOT_REGISTERED");
  if (quote.untrustedTransaction.value !== "0x0") errors.push("NATIVE_VALUE_FORBIDDEN");
  if (!inputAsset || !outputAsset) errors.push("ASSET_NOT_REGISTERED");
  if (policy.forbiddenTargets.includes(quote.untrustedTransaction.to)) errors.push("TARGET_FORBIDDEN");
  if (policy.forbiddenAssets.includes(quote.fromToken) || policy.forbiddenAssets.includes(quote.toToken)) {
    errors.push("ASSET_FORBIDDEN");
  }
  if (!sourceAnchor || ![...requiredChains].every((chainId) => anchors.some((anchor) => anchor.chainId === chainId))) {
    errors.push("ANCHOR_MISSING");
  }
  if (errors.length) return reject(...errors);

  for (const anchor of anchors.filter(({ chainId }) => requiredChains.has(chainId))) {
    if (!await raw.confirmAnchor(anchor)) return reject("ANCHOR_REORGED");
  }
  const identities = [
    { chainId: quote.fromChainId, address: deployment!.address, hash: deployment!.runtimeCodeHash },
    { chainId: quote.fromChainId, address: inputAsset!.address, hash: inputAsset!.runtimeCodeHash },
    { chainId: quote.toChainId, address: outputAsset!.address, hash: outputAsset!.runtimeCodeHash },
  ] as const;
  for (const identity of identities) {
    const anchor = anchors.find(({ chainId }) => chainId === identity.chainId)!;
    if (await raw.getCodeHash(identity.chainId, identity.address, anchor.blockNumber) !== identity.hash) {
      return reject("CODE_IDENTITY_CHANGED");
    }
  }

  const simulation = await raw.simulate({ quote, anchor: sourceAnchor! });
  if (!simulation.reproduced || !simulation.transactionSuccess || !simulation.completeOwnerAssetDiff ||
      simulation.transactionDataHash !== quote.untrustedTransaction.dataHash) {
    return reject("SIMULATION_NOT_REPRODUCED");
  }
  if (!/^[1-9][0-9]*$/.test(simulation.gasUsed) || BigInt(simulation.gasUsed) > 5_000_000n) {
    return reject("GAS_LIMIT_EXCEEDED");
  }
  if (!/^[0-9]+$/.test(simulation.observedInputDecreaseAtomic) ||
      BigInt(simulation.observedInputDecreaseAtomic) > BigInt(policy.maximumInputAtomic)) {
    return reject("SIMULATED_OVERSPEND");
  }
  if (simulation.unexpectedOwnerAssetDecreases.length) return reject("UNDECLARED_ASSET_DECREASE");
  if (quote.fromChainId === quote.toChainId &&
      BigInt(simulation.observedOutputIncreaseAtomic) < BigInt(policy.minimumOutputAtomic)) {
    return reject("SIMULATED_OUTPUT_TOO_LOW");
  }

  const approval = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [quote.approvalAddress, BigInt(quote.fromAmount)],
  });
  const verificationHash = commitment({
    quote, policy, anchors, traceHash: simulation.traceHash, stateDiffHash: simulation.stateDiffHash,
  }) as Hash;
  return {
    accepted: true,
    guarantee: quote.fromChainId === quote.toChainId ? "atomic-same-chain" : "asynchronous-delivery",
    approvals: [{ to: quote.fromToken, data: approval, value: "0x0" }],
    transaction: {
      to: quote.untrustedTransaction.to,
      data: quote.untrustedTransaction.data,
      value: quote.untrustedTransaction.value,
    },
    evidence: {
      traceHash: simulation.traceHash,
      stateDiffHash: simulation.stateDiffHash,
      verificationHash,
    },
  };
}
