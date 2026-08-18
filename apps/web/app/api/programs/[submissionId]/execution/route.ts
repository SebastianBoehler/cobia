import { NextResponse } from "next/server";
import { createPublicClient, erc20Abi, http, isAddressEqual, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { xLayer } from "../../../../../lib/chain/xlayer";
import {
  exactApprovalCalls, prepareAgentExecutionV3,
} from "../../../../../lib/coding-agent-sandbox/agent-execution-v3";
import {
  assertAgentExecutorReadyV1, createAgentExecutorReadV1,
} from "../../../../../lib/coding-agent-sandbox/executor-preflight";
import { verifyAgentExecutionAccessProof } from "../../../../../lib/coding-agent-sandbox/execution-access";
import { readCodingAgentV3ExecutionConfig } from "../../../../../lib/env";
import { getSolverSubmissionRepository } from "../../../../../lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  proof: z.unknown(),
  ownerSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
}).strict();

export async function POST(
  request: Request,
  context: RouteContext<"/api/programs/[submissionId]/execution">,
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
        code: "INVALID_PROOF", message: "Execution proof does not match this program.",
      }, { status: 403 });
    }
    const stored = await getSolverSubmissionRepository().getExecutionContext(submissionId);
    if (!stored || !isAddressEqual(stored.owner as `0x${string}`, proof.owner)) {
      return NextResponse.json({ code: "NOT_FOUND", message: "Owner program not found." }, { status: 404 });
    }
    const config = readCodingAgentV3ExecutionConfig();
    const prepared = prepareAgentExecutionV3({
      context: stored, owner: proof.owner, executor: config.COBIA_EXECUTOR_V3_ADDRESS, nowSec,
    });
    const client = createPublicClient({
      chain: xLayer, transport: http(config.XLAYER_RPC_URL, { timeout: 15_000 }), cacheTime: 0,
    });
    await assertAgentExecutorReadyV1({
      executor: config.COBIA_EXECUTOR_V3_ADDRESS,
      expectedCodeHash: config.COBIA_EXECUTOR_V3_CODE_HASH,
      expectedVerifier: privateKeyToAccount(config.COBIA_VERIFIER_PRIVATE_KEY).address,
      owner: proof.owner,
      inputToken: prepared.approval.to,
      inputAmount: BigInt(prepared.inputAmountAtomic),
      read: createAgentExecutorReadV1(client),
    });
    const allowance = await client.readContract({
      address: prepared.approval.to, abi: erc20Abi, functionName: "allowance",
      args: [proof.owner, config.COBIA_EXECUTOR_V3_ADDRESS],
    });
    return NextResponse.json({
      chainId: 196,
      programVersion: 3,
      owner: proof.owner,
      approvals: exactApprovalCalls({
        token: prepared.approval.to,
        executor: config.COBIA_EXECUTOR_V3_ADDRESS,
        allowance,
        required: BigInt(prepared.inputAmountAtomic),
      }),
      execution: prepared.execution,
      guarantee: "The wallet broadcasts only these independently attested calls. The atomic executor enforces the deadline and post-state bounds.",
      forecast: "Future yield, LP fees, and impermanent loss are not guaranteed.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    return NextResponse.json({
      code: invalid ? "INVALID_REQUEST" : "EXECUTION_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Program execution is unavailable.",
    }, { status: invalid ? 400 : 409 });
  }
}
