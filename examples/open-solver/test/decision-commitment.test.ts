import { commitment } from "@cobia/domain";
import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { canonicalDecisionCommitment } from "../src/decision-commitment";

const hash = (byte: string) => `0x${byte.repeat(64)}`;
const address = (byte: string) => `0x${byte.repeat(40)}`;

describe("solver decision commitments", () => {
  it("commits the same canonical decision that the SDK submits", () => {
    const program = {
      version: 2, kind: "general-onchain", requestId: "550e8400-e29b-41d4-a716-446655440000",
      chainId: 196, policyHash: hash("1"), manifestHash: hash("2"), owner: address("a"),
      executor: address("b"), pinnedBlock: { number: "1", hash: hash("3") },
      deadline: 2_000_000_000, nonce: hash("4"), input: { token: address("c"), atomic: "1" },
      actions: [{ capabilityId: "dex.swap", capabilityVersion: 1, valueAtomic: "0",
        parameters: { amountAtomic: "1" } }],
      balanceConstraints: [{ kind: "minimumIncrease", token: address("d"), atomic: "1" }],
      predicates: [], objective: { kind: "satisfy" },
    };
    const raw = {
      version: 1, decision: "submit", proposalKind: "capability-v2", program,
      evidence: { version: 2, kind: "general-onchain", programHash: hash("A"), chainId: 196,
        blockNumber: "1", blockHash: hash("B"), traceHash: hash("C"),
        stateDiffHash: hash("D"), eventsHash: hash("E"),
        balanceDeltas: [{ token: getAddress(address("a")), account: getAddress(address("b")),
          beforeAtomic: "0", afterAtomic: "1" }], deployments: [], observations: [] },
      provenance: { version: 1, runner: "test@1", dependencies: [], sources: [],
        commandHashes: [], generatedFiles: [] },
    };

    const canonical = canonicalDecisionCommitment(raw);

    expect(canonical.decisionHash).not.toBe(commitment(raw));
    expect(canonical.decisionHash).toBe(commitment(canonical.decision));
    if (canonical.decision.decision !== "submit" ||
        canonical.decision.proposalKind !== "capability-v2") throw new Error("Expected proposal");
    expect(canonical.decision.evidence.balanceDeltas[0]?.account).toBe(address("b"));
  });
});
