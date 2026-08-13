import { NextResponse } from "next/server";
import { createPublicClient, http, isAddressEqual, type Hash, type Hex } from "viem";
import { z } from "zod";
import { xLayer } from "@/lib/chain/xlayer";
import { prepareAgentExecutionV1 } from "@/lib/coding-agent-sandbox/agent-execution";
import { verifyAgentExecutionAccessProof } from "@/lib/coding-agent-sandbox/execution-access";
import { validateAgentExecutionReceiptV1 } from "@/lib/coding-agent-sandbox/execution-receipt";
import { readCodingAgentRuntimeConfig } from "@/lib/env";
import { getAgentProgramRepository } from "@/lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  proof: z.unknown(),
  ownerSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
}).strict();

export async function POST(
  request: Request,
  context: RouteContext<"/api/agent-programs/[programId]/execution/receipt">,
) {
  const { programId } = await context.params;
  try {
    const body = BodySchema.parse(await request.json());
    const nowSec = Math.floor(Date.now() / 1_000);
    const proof = await verifyAgentExecutionAccessProof({
      proof: body.proof,
      signature: body.ownerSignature as Hex,
      nowSec,
    });
    if (proof.programId !== programId || proof.realm !== new URL(request.url).host) {
      return NextResponse.json({ code: "INVALID_PROOF", message: "Receipt proof does not match this program." }, { status: 403 });
    }
    const repository = getAgentProgramRepository();
    const stored = await repository.getExecutionContext(programId);
    if (!stored || !isAddressEqual(stored.owner as `0x${string}`, proof.owner)) {
      return NextResponse.json({ code: "NOT_FOUND", message: "Owner program not found." }, { status: 404 });
    }
    const config = readCodingAgentRuntimeConfig();
    const execution = stored.artifacts.find(({ kind }) => kind === "execution")?.payload as {
      canonicalProgramHash?: Hash;
    } | undefined;
    if (!execution?.canonicalProgramHash) throw new Error("Canonical execution commitment is unavailable");
    const client = createPublicClient({ chain: xLayer, transport: http(config.XLAYER_RPC_URL), cacheTime: 0 });
    const transactionHash = body.transactionHash as Hash;
    const [transaction, receipt] = await Promise.all([
      client.getTransaction({ hash: transactionHash }),
      client.getTransactionReceipt({ hash: transactionHash }),
    ]);
    const block = await client.getBlock({ blockHash: receipt.blockHash });
    const prepared = prepareAgentExecutionV1({
      context: stored,
      owner: proof.owner,
      executor: config.COBIA_EXECUTOR_V2_ADDRESS,
      nowSec: Number(block.timestamp),
    });
    const attributed = validateAgentExecutionReceiptV1({
      expected: {
        owner: proof.owner,
        executor: config.COBIA_EXECUTOR_V2_ADDRESS,
        data: prepared.execution.data,
        canonicalProgramHash: execution.canonicalProgramHash,
      },
      transaction: {
        hash: transaction.hash, from: transaction.from, to: transaction.to,
        input: transaction.input, value: transaction.value,
      },
      receipt: {
        transactionHash: receipt.transactionHash,
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        logs: receipt.logs,
      },
    });
    await repository.append(programId, "receipt", attributed);
    return NextResponse.json({ state: "confirmed", receipt: attributed });
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    return NextResponse.json({
      code: invalid ? "INVALID_REQUEST" : "RECEIPT_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Could not attribute execution receipt.",
    }, { status: invalid ? 400 : 409 });
  }
}
