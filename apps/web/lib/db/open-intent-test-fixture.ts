import { OpenIntentPolicyV3Schema } from "@cobia/domain";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;

export function createOpenIntentTestPolicy(input: {
  requestId?: string;
  nowSec?: number;
  owner?: `0x${string}`;
} = {}) {
  const nowSec = input.nowSec ?? 2_000_000_000;
  return OpenIntentPolicyV3Schema.parse({
    version: 3,
    kind: "open-onchain",
    requestId: input.requestId ?? "11111111-1111-4111-8111-111111111111",
    displayGoal: "Increase the verified output-token balance",
    owner: input.owner ?? "0x1111111111111111111111111111111111111111",
    executionChainIds: [196],
    nonce: hash("1"),
    createdAt: nowSec - 60,
    deadline: nowSec + 1_800,
    competition: { closesAt: nowSec + 300, maxRevisionsPerSolver: 3 },
    maxEvidenceAgeSec: 300,
    inputs: [{
      chainId: 196,
      token: "0x2222222222222222222222222222222222222222",
      maximumAtomic: "10000000",
    }],
    outcomes: [{
      kind: "minimum-increase",
      chainId: 196,
      token: "0x3333333333333333333333333333333333333333",
      atomic: "9950000",
    }],
    limits: {
      maxStages: 4,
      maxTransactions: 4,
      maxApprovals: 2,
      maxCalldataBytes: 8_192,
      maxGasPerTransaction: "1000000",
      maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "0" }],
    },
    forbiddenTargets: [],
    forbiddenAssets: [],
  });
}
