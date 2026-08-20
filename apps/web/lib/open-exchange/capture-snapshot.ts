import {
  OpenIntentPolicyV3Schema,
  OpenIntentSnapshotV1Schema,
  type OpenIntentPolicyV3,
  type OpenIntentSnapshotV1,
} from "@cobia/domain";
import type { Hash } from "viem";

interface XLayerSnapshotReadV1 {
  getChainId(): Promise<number>;
  getBlock(): Promise<{ number: bigint; hash: Hash | null; timestamp: bigint }>;
}

export async function captureOpenIntentSnapshotV1(
  value: OpenIntentPolicyV3,
  read: XLayerSnapshotReadV1,
): Promise<OpenIntentSnapshotV1> {
  const policy = OpenIntentPolicyV3Schema.parse(value);
  if (policy.executionChainIds.length !== 1 || policy.executionChainIds[0] !== 196) {
    throw new Error("The first public solver release supports X Layer only");
  }
  if (await read.getChainId() !== 196) throw new Error("Snapshot RPC chain identity mismatch");
  const block = await read.getBlock();
  if (block.number <= 0n || !block.hash || block.timestamp <= 0n) {
    throw new Error("Snapshot RPC returned an invalid canonical block");
  }
  return OpenIntentSnapshotV1Schema.parse({
    version: 1,
    kind: "open-onchain",
    requestId: policy.requestId,
    capturedAt: new Date(Number(block.timestamp) * 1_000).toISOString(),
    anchors: [{ chainId: 196, blockNumber: block.number.toString(), blockHash: block.hash }],
  });
}
