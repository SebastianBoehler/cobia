import type { TransactionProgramEvidenceV1 } from "@cobia/solvers";
import { describe, expect, it } from "vitest";
import { okxSimulationFromEvidenceV1 } from "./transaction-verifier";

const owner = "0x1111111111111111111111111111111111111111" as const;
const input = "0x2222222222222222222222222222222222222222" as const;
const output = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const;
const spender = "0x3333333333333333333333333333333333333333" as const;
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const stage = { id: "01-okx-swap", sender: owner, input: { token: input, atomic: "10" },
  output: { token: output, minimumAtomic: "2" }, approval: { token: input, spender,
    maximumAtomic: "10" }, transaction: { dataHash: hash("1") } };
const evidence: TransactionProgramEvidenceV1 = { version: 1, programHash: hash("2"), capturedAt: 100,
  simulations: [{ stageId: "01-okx-swap", chainId: 196, blockNumber: "10", blockHash: hash("3"),
    transactionDataHash: hash("1"), success: true, calldataBytes: 10, gasUsed: "100",
    traceHash: hash("4"), stateDiffHash: hash("5"), eventsHash: hash("6"),
    completeAssetCoverage: true, assetDeltas: [
      { token: input, account: owner, beforeAtomic: "10", afterAtomic: "0", deltaAtomic: "-10" },
      { token: output, account: owner, beforeAtomic: "0", afterAtomic: "2", deltaAtomic: "2" },
      { token: spender, account: owner, beforeAtomic: "3", afterAtomic: "2", deltaAtomic: "-1" },
    ], allowanceDeltas: [{ token: input, owner, spender, beforeAtomic: "0", afterAtomic: "0" }],
    codeIdentities: [] }],
};

describe("OKX provider replay projection", () => {
  it("derives exact provider checks from the independently captured stage evidence", () => {
    expect(okxSimulationFromEvidenceV1(stage, evidence)).toEqual({
      reproduced: true, transactionSuccess: true, completeOwnerAssetDiff: true,
      transactionDataHash: hash("1"), gasUsed: "100",
      observedInputDecreaseAtomic: "10", observedOutputIncreaseAtomic: "2",
      unexpectedOwnerAssetDecreases: [spender], residualAllowanceAtomic: "0",
      traceHash: hash("4"), stateDiffHash: hash("5"),
    });
  });

  it("fails closed when the stage evidence is absent", () => {
    expect(okxSimulationFromEvidenceV1({ ...stage, id: "02-missing" }, evidence))
      .toBeUndefined();
  });
});
