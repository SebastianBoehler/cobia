import { describe, expect, it } from "vitest";
import { toEventSelector, type Hash } from "viem";
import {
  assertCanonicalAgentExecutionReceipt,
  PROGRAM_EXECUTED_EVENT_V3,
  validateAgentExecutionReceiptV3,
} from "./execution-receipt-v3";

const owner = "0x1111111111111111111111111111111111111111" as const;
const executor = "0x2222222222222222222222222222222222222222" as const;
const transactionHash = `0x${"33".repeat(32)}` as const;
const blockHash = `0x${"44".repeat(32)}` as const;
const canonicalProgramHash = `0x${"55".repeat(32)}` as const;
const executionCommitment = `0x${"66".repeat(32)}` as const;
const data = "0x12345678" as const;
const event = {
  address: executor,
  topics: [
    toEventSelector(PROGRAM_EXECUTED_EVENT_V3),
    `0x${owner.slice(2).padStart(64, "0")}`,
    canonicalProgramHash,
    executionCommitment,
  ] as Hash[],
  data: `0x${"77".repeat(64)}` as const,
};

const input = {
  expected: { owner, executor, data, canonicalProgramHash, executionCommitment },
  transaction: { hash: transactionHash, from: owner, to: executor, input: data, value: 0n },
  receipt: {
    transactionHash, status: "success" as const, blockNumber: 123n, blockHash, logs: [event],
  },
};

describe("general executor receipt attribution", () => {
  it("attributes the exact owner call and V3 execution commitment", () => {
    expect(validateAgentExecutionReceiptV3(input)).toMatchObject({
      transactionHash, owner, executor, canonicalProgramHash, executionCommitment,
    });
  });

  it("rejects a V2 event selector or changed program/execution topic", () => {
    for (const topics of [
      [`0x${"00".repeat(32)}`, ...event.topics.slice(1)],
      [event.topics[0], event.topics[1], `0x${"00".repeat(32)}`, event.topics[3]],
      [event.topics[0], event.topics[1], event.topics[2], `0x${"00".repeat(32)}`],
    ] as Hash[][]) {
      expect(() => validateAgentExecutionReceiptV3({
        ...input,
        receipt: { ...input.receipt, logs: [{ ...event, topics }] },
      })).toThrow(/event/i);
    }
  });

  it("rejects an orphaned receipt block", () => {
    expect(() => assertCanonicalAgentExecutionReceipt({
      receipt: input.receipt,
      canonicalBlock: { number: 123n, hash: `0x${"88".repeat(32)}` },
      latestBlockNumber: 124n,
    })).toThrow("General execution receipt block is no longer canonical");
  });

  it("waits for a confirmation before persisting execution evidence", () => {
    expect(() => assertCanonicalAgentExecutionReceipt({
      receipt: input.receipt,
      canonicalBlock: { number: 123n, hash: blockHash },
      latestBlockNumber: 123n,
    })).toThrow("General execution receipt requires one confirmation");
  });
});
