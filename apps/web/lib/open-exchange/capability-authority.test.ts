import { OpenIntentPolicyV3Schema, commitment } from "@cobia/domain";
import { describe, expect, it } from "vitest";
import { deriveCapabilityAuthorityV2 } from "./capability-authority";

const policy = OpenIntentPolicyV3Schema.parse({
  version: 3, kind: "open-onchain", requestId: "550e8400-e29b-41d4-a716-446655440000",
  displayGoal: "Receive an enforceable output", owner: "0x1111111111111111111111111111111111111111",
  executionChainIds: [196], nonce: `0x${"11".repeat(32)}`, createdAt: 2_000_000_000,
  deadline: 2_000_001_800, competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 5 },
  maxEvidenceAgeSec: 300,
  inputs: [{ chainId: 196, token: "0x2222222222222222222222222222222222222222", maximumAtomic: "10" }],
  outcomes: [{ kind: "minimum-increase", chainId: 196,
    token: "0x3333333333333333333333333333333333333333", atomic: "9" }],
  limits: { maxStages: 4, maxTransactions: 2, maxApprovals: 2, maxCalldataBytes: 16_384,
    maxGasPerTransaction: "5000000", maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "0" }] },
  forbiddenTargets: [], forbiddenAssets: [],
});
const snapshot = { version: 1 as const, kind: "open-onchain" as const,
  requestId: policy.requestId, capturedAt: "2033-05-18T03:33:20.000Z",
  anchors: [{ chainId: 196 as const, blockNumber: "68461706",
    blockHash: `0x${"22".repeat(32)}` as `0x${string}` }] };

describe("open capability authority", () => {
  it("derives a deterministic registered-capability policy from the wallet-signed open policy", () => {
    const result = deriveCapabilityAuthorityV2(policy, snapshot);
    expect(result.policy).toMatchObject({ requestId: policy.requestId, owner: policy.owner,
      input: { token: policy.inputs[0]!.token, maxAtomic: "10" },
      balanceConstraints: [{ kind: "minimumIncrease",
        token: policy.outcomes[0]!.kind === "minimum-increase" ? policy.outcomes[0].token : "", atomic: "9" }],
      objective: { kind: "satisfy" } });
    expect(result.policy.allowedCapabilities.map(({ id }) => id)).toEqual([
      "aave-v3.supply", "curve-stableswap-ng.exact-input", "uniswap-v3.exact-input",
    ]);
    expect(result.snapshot).toMatchObject({ blockNumber: "68461706",
      manifestHash: commitment(result.manifest) });
  });
});
