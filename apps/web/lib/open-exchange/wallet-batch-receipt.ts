import { getAddress, isAddressEqual, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";

const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value) => value.toLowerCase() as Hash);
const BatchSchema = z.object({
  version: z.literal(1), kind: z.literal("wallet-call-batch"), owner: z.string(),
  deadline: z.number().int().positive(), assurance: z.literal("exact-call-fork-replay"),
  stages: z.array(z.object({ stageId: z.string(), chainId: z.literal(196),
    calls: z.array(z.object({ to: z.string(), data: z.string(), value: z.string() }).strict()) }).strict()),
}).strict();

export async function verifyOpenWalletBatchReceiptsV1(input: {
  batch: unknown; owner: Address; transactionHashes: unknown; latestBlockNumber: bigint;
  readTransaction(hash: Hash): Promise<{ hash: Hash; from: Address; to: Address | null;
    input: Hex; value: bigint }>;
  readReceipt(hash: Hash): Promise<{ transactionHash: Hash; status: "success" | "reverted";
    blockNumber: bigint; blockHash: Hash }>;
  readCanonicalBlock(number: bigint): Promise<{ number: bigint | null; hash: Hash | null }>;
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
    if (transaction.hash !== receipt.transactionHash || transaction.hash !== hash ||
      receipt.status !== "success" || !transaction.to ||
      !isAddressEqual(transaction.from, input.owner) ||
      !isAddressEqual(transaction.to, getAddress(expected.to)) ||
      transaction.input.toLowerCase() !== expected.data.toLowerCase() ||
      transaction.value !== BigInt(expected.value) || block.number !== receipt.blockNumber ||
      block.hash?.toLowerCase() !== receipt.blockHash.toLowerCase() ||
      input.latestBlockNumber < receipt.blockNumber + 1n) {
      throw new Error(`Wallet batch receipt ${index + 1} does not match the verified call`);
    }
    receipts.push({ stageId: expected.stageId, transactionHash: hash,
      blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash });
  }
  return { version: 1 as const, kind: "wallet-call-batch-receipt" as const,
    owner: input.owner.toLowerCase() as Address, transactionHash: hashes.at(-1)!, receipts };
}
