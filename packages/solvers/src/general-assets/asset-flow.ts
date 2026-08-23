import type { GeneralAssetStageV1 } from "@cobia/domain";
import type { Address } from "viem";

export interface GeneralAssetStageReplayV1 {
  stageId: `0x${string}`;
  chainId: 1 | 196;
  blockNumber: string;
  blockHash: `0x${string}`;
  compiledCallHash: `0x${string}`;
  matchesCompiledCalls: boolean;
  success: boolean;
  gasUsed: string;
  ownerAssetDeltas: Array<{ token: Address; deltaAtomic: string }>;
  endingAllowances: Array<{ token: Address; spender: Address; atomic: string }>;
  traceHash: `0x${string}`;
  stateDiffHash: `0x${string}`;
}

function add(map: Map<string, bigint>, key: string, value: bigint): void {
  map.set(key, (map.get(key) ?? 0n) + value);
}

export function assessGeneralAssetStageFlowV1(
  stage: GeneralAssetStageV1,
  replay: GeneralAssetStageReplayV1,
): string[] {
  const errors = new Set<string>();
  const deltas = new Map<string, bigint>();
  for (const delta of replay.ownerAssetDeltas) add(deltas, delta.token, BigInt(delta.deltaAtomic));

  for (const [token, delta] of deltas) {
    if (delta < 0n && token !== stage.input.token) errors.add("UNDECLARED_ASSET_DECREASE");
  }
  const inputDecrease = -(deltas.get(stage.input.token) ?? 0n);
  if (inputDecrease > BigInt(stage.input.maximumAtomic)) errors.add("INPUT_LIMIT_EXCEEDED");
  for (const output of stage.outputs) {
    if ((deltas.get(output.token) ?? 0n) < BigInt(output.minimumIncreaseAtomic)) {
      errors.add("OUTPUT_NOT_REPRODUCED");
    }
  }
  if (replay.endingAllowances.some(({ atomic }) => BigInt(atomic) !== 0n)) {
    errors.add("ALLOWANCE_NOT_CLEARED");
  }
  return [...errors].sort();
}
