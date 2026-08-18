import { isAddressEqual, parseAbiItem, toEventSelector, type Address, type Hash, type Hex } from "viem";

export const PROGRAM_EXECUTED_EVENT_V3 = parseAbiItem(
  "event ProgramExecuted(address indexed owner, bytes32 indexed canonicalProgramHash, bytes32 indexed executionCommitment, bytes32 simulationHash, bytes32 predicateResultsHash)",
);

interface ExpectedCallV3 {
  owner: Address;
  executor: Address;
  data: Hex;
  canonicalProgramHash: Hash;
  executionCommitment: Hash;
}

export function assertCanonicalAgentExecutionReceipt(input: {
  receipt: { blockNumber: bigint; blockHash: Hash };
  canonicalBlock: { number: bigint; hash: Hash | null };
  latestBlockNumber: bigint;
}) {
  const { receipt, canonicalBlock } = input;
  if (canonicalBlock.number !== receipt.blockNumber ||
    canonicalBlock.hash?.toLowerCase() !== receipt.blockHash.toLowerCase()) {
    throw new Error("General execution receipt block is no longer canonical");
  }
  if (input.latestBlockNumber <= receipt.blockNumber) {
    throw new Error("General execution receipt requires one confirmation");
  }
}

export function validateAgentExecutionReceiptV3(input: {
  expected: ExpectedCallV3;
  transaction: {
    hash: Hash;
    from: Address;
    to: Address | null;
    input: Hex;
    value: bigint;
  };
  receipt: {
    transactionHash: Hash;
    status: "success" | "reverted";
    blockNumber: bigint;
    blockHash: Hash;
    logs: readonly { address: Address; topics: readonly Hash[]; data: Hex }[];
  };
}) {
  const { transaction, receipt, expected } = input;
  if (transaction.hash !== receipt.transactionHash || receipt.status !== "success" ||
    !transaction.to || !isAddressEqual(transaction.from, expected.owner) ||
    !isAddressEqual(transaction.to, expected.executor) || transaction.value !== 0n ||
    transaction.input.toLowerCase() !== expected.data.toLowerCase()) {
    throw new Error("General execution receipt does not match the exact owner transaction");
  }
  const eventTopic = toEventSelector(PROGRAM_EXECUTED_EVENT_V3);
  const ownerTopic = `0x${expected.owner.slice(2).padStart(64, "0")}`.toLowerCase();
  const event = receipt.logs.find(({ address, topics }) =>
    isAddressEqual(address, expected.executor) &&
    topics[0]?.toLowerCase() === eventTopic.toLowerCase() &&
    topics[1]?.toLowerCase() === ownerTopic &&
    topics[2]?.toLowerCase() === expected.canonicalProgramHash.toLowerCase() &&
    topics[3]?.toLowerCase() === expected.executionCommitment.toLowerCase());
  if (!event) throw new Error("General execution receipt is missing the attributed V3 event");
  return {
    version: 3 as const,
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber.toString(),
    blockHash: receipt.blockHash,
    owner: expected.owner,
    executor: expected.executor,
    canonicalProgramHash: expected.canonicalProgramHash,
    executionCommitment: expected.executionCommitment,
  };
}
