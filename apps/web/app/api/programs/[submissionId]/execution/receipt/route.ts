import { NextResponse } from "next/server";
import { createPublicClient, http, isAddressEqual, type Hash, type Hex } from "viem";
import { z } from "zod";
import { xLayer } from "../../../../../../lib/chain/xlayer";
import { prepareAgentExecutionV3 } from "../../../../../../lib/coding-agent-sandbox/agent-execution-v3";
import { verifyAgentExecutionAccessProof } from "../../../../../../lib/coding-agent-sandbox/execution-access";
import {
  assertCanonicalAgentExecutionReceipt, validateAgentExecutionReceiptV3,
} from "../../../../../../lib/coding-agent-sandbox/execution-receipt-v3";
import { readCodingAgentV3ExecutionConfig } from "../../../../../../lib/env";
import { getSolverSubmissionRepository } from "../../../../../../lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  proof: z.unknown(),
  ownerSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
}).strict();

export async function POST(
  request: Request,
  context: RouteContext<"/api/programs/[submissionId]/execution/receipt">,
) {
  const { submissionId } = await context.params;
  try {
    const body = BodySchema.parse(await request.json());
    const nowSec = Math.floor(Date.now() / 1_000);
    const proof = await verifyAgentExecutionAccessProof({
      proof: body.proof, signature: body.ownerSignature as Hex, nowSec,
    });
    if (proof.programId !== submissionId || proof.realm !== new URL(request.url).host) {
      return NextResponse.json({
        code: "INVALID_PROOF", message: "Receipt proof does not match this program.",
      }, { status: 403 });
    }
    const repository = getSolverSubmissionRepository();
    const stored = await repository.getExecutionContext(submissionId);
    if (!stored || !isAddressEqual(stored.owner as `0x${string}`, proof.owner)) {
      return NextResponse.json({ code: "NOT_FOUND", message: "Owner program not found." }, { status: 404 });
    }
    const config = readCodingAgentV3ExecutionConfig();
    const client = createPublicClient({
      chain: xLayer, transport: http(config.XLAYER_RPC_URL, { timeout: 15_000 }), cacheTime: 0,
    });
    const transactionHash = body.transactionHash as Hash;
    const [transaction, receipt] = await Promise.all([
      client.getTransaction({ hash: transactionHash }),
      client.getTransactionReceipt({ hash: transactionHash }),
    ]);
    const [block, latestBlock] = await Promise.all([
      client.getBlock({ blockNumber: receipt.blockNumber }), client.getBlock(),
    ]);
    if (block.number === null || latestBlock.number === null) {
      throw new Error("Execution receipt block metadata is unavailable");
    }
    assertCanonicalAgentExecutionReceipt({
      receipt,
      canonicalBlock: { number: block.number, hash: block.hash },
      latestBlockNumber: latestBlock.number,
    });
    const prepared = prepareAgentExecutionV3({
      context: stored,
      owner: proof.owner,
      executor: config.COBIA_EXECUTOR_V3_ADDRESS,
      nowSec: Number(block.timestamp),
    });
    const attributed = validateAgentExecutionReceiptV3({
      expected: {
        owner: proof.owner,
        executor: config.COBIA_EXECUTOR_V3_ADDRESS,
        data: prepared.execution.data,
        canonicalProgramHash: prepared.canonicalProgramHash,
        executionCommitment: prepared.executionCommitment,
      },
      transaction: {
        hash: transaction.hash, from: transaction.from, to: transaction.to,
        input: transaction.input, value: transaction.value,
      },
      receipt: {
        transactionHash: receipt.transactionHash, status: receipt.status,
        blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, logs: receipt.logs,
      },
    });
    await repository.appendArtifact(submissionId, "receipt", attributed);
    await repository.resolve(submissionId, "executed", []);
    return NextResponse.json({ state: "confirmed", receipt: attributed });
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    return NextResponse.json({
      code: invalid ? "INVALID_REQUEST" : "RECEIPT_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Could not attribute execution receipt.",
    }, { status: invalid ? 400 : 409 });
  }
}
