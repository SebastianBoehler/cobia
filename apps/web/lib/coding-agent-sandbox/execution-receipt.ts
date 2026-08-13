import { isAddressEqual, parseAbiItem, toEventSelector, type Address, type Hash, type Hex } from "viem";

export const PROGRAM_EXECUTED_EVENT = parseAbiItem(
  "event ProgramExecuted(address indexed owner, bytes32 indexed canonicalProgramHash, bytes32 indexed executionCommitment, bytes32 simulationHash)",
);

interface ExpectedCall {
  owner: Address;
  executor: Address;
  data: Hex;
  canonicalProgramHash: Hash;
}

export function validateAgentExecutionReceiptV1(input: {
  expected: ExpectedCall;
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
    throw new Error("Execution receipt does not match the exact owner transaction");
  }
  const eventTopic = toEventSelector(PROGRAM_EXECUTED_EVENT);
  const ownerTopic = `0x${expected.owner.slice(2).padStart(64, "0")}`.toLowerCase();
  const event = receipt.logs.find(({ address, topics }) =>
    isAddressEqual(address, expected.executor) &&
    topics[0]?.toLowerCase() === eventTopic.toLowerCase() &&
    topics[1]?.toLowerCase() === ownerTopic &&
    topics[2]?.toLowerCase() === expected.canonicalProgramHash.toLowerCase());
  if (!event) throw new Error("Execution receipt is missing the attributed ProgramExecuted event");
  return {
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber.toString(),
    blockHash: receipt.blockHash,
    owner: expected.owner,
    executor: expected.executor,
    canonicalProgramHash: expected.canonicalProgramHash,
  };
}
