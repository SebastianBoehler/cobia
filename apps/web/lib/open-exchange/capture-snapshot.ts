import {
  OpenIntentPolicyV3Schema,
  OpenIntentSnapshotV1Schema,
  isNativeAssetAddress,
  type ContractTokenMarketEvidenceV1,
  type NativeTokenMarketEvidenceV1,
  type OpenIntentPolicyV3,
  type OpenIntentSnapshotV1,
} from "@cobia/domain";
import type { Address, Hash } from "viem";

interface SnapshotReadV1 {
  getChainId(): Promise<number>;
  getBlock(): Promise<{ number: bigint; hash: Hash | null; timestamp: bigint }>;
}

type SnapshotReadsV1 = SnapshotReadV1 | Readonly<Partial<Record<1 | 196 | 8453, SnapshotReadV1>>>;

interface TokenEvidenceReadV1 {
  getXLayerTokenEvidence(token: string): Promise<Omit<ContractTokenMarketEvidenceV1, "provider">>;
  getXLayerNativeTokenEvidence?(): Promise<Omit<NativeTokenMarketEvidenceV1, "provider">>;
}

function nativeEvidenceReader(market: TokenEvidenceReadV1) {
  if (!market.getXLayerNativeTokenEvidence) {
    throw new Error("Native X Layer OKB market evidence is unavailable");
  }
  return market.getXLayerNativeTokenEvidence();
}

function reader(reads: SnapshotReadsV1, chainId: 1 | 196 | 8453): SnapshotReadV1 {
  if ("getChainId" in reads) return reads;
  const value = reads[chainId];
  if (!value) throw new Error(`Snapshot RPC for chain ${chainId} is unavailable`);
  return value;
}

export async function captureOpenIntentSnapshotV1(
  value: OpenIntentPolicyV3,
  reads: SnapshotReadsV1,
  market?: TokenEvidenceReadV1,
): Promise<OpenIntentSnapshotV1> {
  const policy = OpenIntentPolicyV3Schema.parse(value);
  const blocks = await Promise.all(policy.executionChainIds.map(async (chainId) => {
    const read = reader(reads, chainId);
    if (await read.getChainId() !== chainId) throw new Error("Snapshot RPC chain identity mismatch");
    const block = await read.getBlock();
    if (block.number <= 0n || !block.hash || block.timestamp <= 0n) {
      throw new Error("Snapshot RPC returned an invalid canonical block");
    }
    return { chainId, block };
  }));
  const capturedAt = blocks.reduce((minimum, { block }) =>
    block.timestamp < minimum ? block.timestamp : minimum, blocks[0]!.block.timestamp);
  const tokenAddresses = market ? [...new Set([
    ...policy.inputs.filter(({ chainId }) => chainId === 196)
      .map(({ token }) => token),
    ...policy.outcomes.filter((outcome) => outcome.chainId === 196 && "token" in outcome)
      .map((outcome) => (outcome as { token: Address }).token)
  ])].sort() : [];
  const tokenEvidence = market ? await Promise.all(tokenAddresses.map(async (token) => ({
    provider: "okx-market-v6" as const,
    ...await (isNativeAssetAddress(token)
      ? nativeEvidenceReader(market)
      : market.getXLayerTokenEvidence(token)),
  }))) : undefined;
  if (tokenEvidence?.some(({ marketDataAt }) => {
    const marketSec = Date.parse(marketDataAt) / 1_000;
    return !Number.isFinite(marketSec) ||
      Math.abs(marketSec - Number(capturedAt)) > policy.maxEvidenceAgeSec;
  })) throw new Error("OKX token market evidence is stale");
  return OpenIntentSnapshotV1Schema.parse({
    version: 1,
    kind: "open-onchain",
    requestId: policy.requestId,
    capturedAt: new Date(Number(capturedAt) * 1_000).toISOString(),
    anchors: blocks.map(({ chainId, block }) => ({
      chainId, blockNumber: block.number.toString(), blockHash: block.hash!,
    })),
    ...(tokenEvidence?.length ? { tokenEvidence } : {}),
  });
}
