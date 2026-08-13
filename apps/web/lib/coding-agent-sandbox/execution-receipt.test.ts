import { encodeEventTopics, type Hash } from "viem";
import { describe, expect, it } from "vitest";
import { PROGRAM_EXECUTED_EVENT, validateAgentExecutionReceiptV1 } from "./execution-receipt";

const owner = "0x1111111111111111111111111111111111111111" as const;
const executor = "0x2222222222222222222222222222222222222222" as const;
const programHash = `0x${"33".repeat(32)}` as const;
const transactionHash = `0x${"44".repeat(32)}` as const;

describe("agent execution receipt attribution", () => {
  it("accepts only the exact owner call and ProgramExecuted event", () => {
    const topics = encodeEventTopics({
      abi: [PROGRAM_EXECUTED_EVENT], eventName: "ProgramExecuted",
      args: {
        owner,
        canonicalProgramHash: programHash,
        executionCommitment: `0x${"77".repeat(32)}`,
      },
    });
    expect(validateAgentExecutionReceiptV1({
      expected: { owner, executor, data: "0x12345678", canonicalProgramHash: programHash },
      transaction: { hash: transactionHash, from: owner, to: executor, input: "0x12345678", value: 0n },
      receipt: { transactionHash, status: "success", blockNumber: 100n, blockHash: `0x${"55".repeat(32)}`, logs: [{ address: executor, topics: topics as Hash[], data: `0x${"00".repeat(32)}` }] },
    })).toMatchObject({ transactionHash, blockNumber: "100", canonicalProgramHash: programHash });
  });

  it("rejects a changed call or missing event", () => {
    expect(() => validateAgentExecutionReceiptV1({
      expected: { owner, executor, data: "0x12345678", canonicalProgramHash: programHash },
      transaction: { hash: transactionHash, from: owner, to: executor, input: "0x87654321", value: 0n },
      receipt: { transactionHash, status: "success", blockNumber: 100n, blockHash: `0x${"55".repeat(32)}`, logs: [] },
    })).toThrow();
  });
});
