import { getAddress, isAddressEqual, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";
import { verifiedWalletCallMatchV1 } from "./wallet-call-match";

const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value) => value.toLowerCase() as Hash);
const BatchSchema = z.object({
  version: z.literal(1), kind: z.literal("wallet-call-batch"), owner: z.string(),
  deadline: z.number().int().positive(), assurance: z.enum([
    "exact-call-fork-replay", "exact-execution-flexible-approval",
  ]),
  stages: z.array(z.object({ stageId: z.string(), chainId: z.union([
    z.literal(1), z.literal(196), z.literal(8453),
  ]),
    calls: z.array(z.object({ to: z.string(), data: z.string(), value: z.string() }).strict()) }).strict()),
}).strict().refine((batch) => new Set(batch.stages.map(({ chainId }) => chainId)).size === 1, {
  message: "Wallet batch must execute on one chain",
});

export async function verifyOpenWalletBatchReceiptsV1(input: {
  batch: unknown; owner: Address; transactionHashes: unknown; latestBlockNumber: bigint;
  readTransaction(hash: Hash): Promise<{ hash: Hash; from: Address; to: Address | null;
    input: Hex; value: bigint }>;
  readReceipt(hash: Hash): Promise<{ transactionHash: Hash; status: "success" | "reverted";
    blockNumber: bigint; blockHash: Hash }>;
  readCanonicalBlock(number: bigint): Promise<{
    number: bigint | null; hash: Hash | null; timestamp: bigint;
  }>;
}) {
  const batch = BatchSchema.parse(input.batch);
  if (!isAddressEqual(batch.owner as Address, input.owner)) throw new Error("Wallet batch owner mismatch");
  const hashes = z.array(HashSchema).min(1).max(32).parse(input.transactionHashes);
  const calls = batch.stages.flatMap(({ stageId, calls }) => calls.map((call) => ({ stageId, ...call })));
  if (hashes.length !== calls.length || new Set(hashes).size !== hashes.length) {
    throw new Error("Wallet batch receipt count mismatch");
  }
  const receipts = [];
  for (const [index, hash] of hashes.entries()) {
    const expected = calls[index]!;
    const [transaction, receipt] = await Promise.all([
      input.readTransaction(hash), input.readReceipt(hash),
    ]);
    const block = await input.readCanonicalBlock(receipt.blockNumber);
    const callMatch = verifiedWalletCallMatchV1({ to: getAddress(expected.to),
      data: expected.data as Hex, value: expected.value as `0x${string}` }, input.owner, {
      from: transaction.from, to: transaction.to, input: transaction.input,
      value: `0x${transaction.value.toString(16)}`,
    }, { allowSufficientApproval: batch.assurance === "exact-execution-flexible-approval" });
    if (transaction.hash !== receipt.transactionHash || transaction.hash !== hash ||
      receipt.status !== "success" || !transaction.to ||
      !callMatch || block.number !== receipt.blockNumber ||
      block.hash?.toLowerCase() !== receipt.blockHash.toLowerCase() ||
      input.latestBlockNumber < receipt.blockNumber + 1n) {
      throw new Error(`Wallet batch receipt ${index + 1} does not match the verified call`);
    }
    if (block.timestamp > BigInt(batch.deadline)) {
      throw new Error(`Wallet batch receipt ${index + 1} was mined after the signed deadline`);
    }
    receipts.push({ stageId: expected.stageId, transactionHash: hash,
      blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash });
  }
  return { version: 1 as const, kind: "wallet-call-batch-receipt" as const,
    owner: input.owner.toLowerCase() as Address, transactionHash: hashes.at(-1)!, receipts };
}
